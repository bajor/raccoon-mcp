import { Graph, layout } from '@dagrejs/dagre';
import type { Draft } from './contract.js';

type Diagram = Draft['chapters'][number]['diagrams'][number];
type Layout = 'landscape' | 'portrait';
type Point = { x: number; y: number };
type Route = { points: Point[]; x?: number; y?: number };
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const CHARACTER_WIDTH = 9;
const PADDING = 16;

function xml(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(value)) {
    throw new Error('Diagram label contains invalid XML characters');
  }
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

function measure(label: string) {
  const words = label.split(/\s+/u).filter(Boolean).flatMap((word) => word.match(/.{1,26}/gu) ?? []);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && [...lines[last]!, ...word].length < 26) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return { lines, width: Math.max(1, ...lines.map((line) => [...line].length)) * CHARACTER_WIDTH + PADDING * 2,
    height: Math.max(1, lines.length) * LINE_HEIGHT + PADDING * 2 };
}

export function layoutDiagram(diagram: Diagram, orientation: Layout = 'landscape') {
  const graph = new Graph({ multigraph: true });
  graph.setGraph({ rankdir: orientation === 'landscape' ? 'LR' : 'TB', ranksep: 40,
    nodesep: 28, edgesep: 20, marginx: 24, marginy: 24 });
  const ids = new Map(diagram.nodes.map((node, index) => [node.id, `node-${index}`]));
  const labels = diagram.nodes.map((node) => measure(node.label));
  diagram.nodes.forEach((node, index) => graph.setNode(ids.get(node.id)!, { width: labels[index]!.width, height: labels[index]!.height }));
  const edgeLabels = diagram.edges.map((edge) => edge.label.trim() ? measure(edge.label) : { lines: [], width: 0, height: 0 });
  diagram.edges.forEach((edge, index) => {
    const from = ids.get(edge.from)!; const to = ids.get(edge.to)!;
    if (from !== to) graph.setEdge(from, to, { ...edgeLabels[index]!, labelpos: 'c' }, String(index));
    else {
      // A label node keeps self-loop attachment and bounds in the same routing model.
      graph.setNode(`loop-${index}`, { width: Math.max(1, edgeLabels[index]!.width), height: Math.max(1, edgeLabels[index]!.height) });
      graph.setEdge(from, `loop-${index}`, {}, `${index}-out`);
      graph.setEdge(`loop-${index}`, from, {}, `${index}-back`);
    }
  });
  layout(graph);
  const nodes = diagram.nodes.map((node, index) => {
    const placed: Point & { width: number; height: number } = graph.node(ids.get(node.id)!);
    return { ...labels[index]!, x: placed.x - placed.width / 2, y: placed.y - placed.height / 2, label: node.label };
  });
  const edges = diagram.edges.map((edge, index) => {
    const from = ids.get(edge.from)!; const to = ids.get(edge.to)!;
    const placed: Route = from === to ? { ...graph.node(`loop-${index}`), points: [
      ...(graph.edge(from, `loop-${index}`, `${index}-out`) as Route).points,
      ...(graph.edge(`loop-${index}`, from, `${index}-back`) as Route).points,
    ] } : graph.edge(from, to, String(index));
    const { width, height, lines } = edgeLabels[index]!;
    return { points: placed.points, lines, label: { x: (placed.x ?? 0) - width / 2, y: (placed.y ?? 0) - height / 2, width, height } };
  });
  const size: { width: number; height: number } = graph.graph();
  return { width: size.width, height: size.height, nodes, edges };
}

function text(lines: string[], x: number, y: number): string {
  return lines.map((line, index) => `<text x="${x}" y="${y + PADDING + FONT_SIZE + index * LINE_HEIGHT}" text-anchor="middle">${xml(line)}</text>`).join('');
}

export function renderDiagram(diagram: Diagram, orientation: Layout = 'landscape') {
  const { width, height, nodes, edges } = layoutDiagram(diagram, orientation);
  const paths = edges.map((edge) => `<path d="${edge.points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}" fill="none" stroke="#46535c" stroke-width="1.5" marker-end="url(#arrow)"/>`);
  const labels = edges.map(({ label, lines }) => lines.length
    ? `<rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" fill="#fff"/>` +
      text(lines, label.x + label.width / 2, label.y) : '');
  const boxes = nodes.map((node) => `<g><title>${xml(node.label)}</title>` +
    `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" fill="#f3f5f6" stroke="#46535c"/>` +
    text(node.lines, node.x + node.width / 2, node.y) + '</g>');
  const data = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(diagram.title)}" font-family="monospace" font-size="${FONT_SIZE}" fill="#17232c">` +
    `<title>${xml(diagram.title)}</title><rect width="${width}" height="${height}" fill="#fff"/>` +
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#46535c"/></marker></defs>' +
    paths.join('') + labels.join('') + boxes.join('') + '</svg>', 'utf8');
  return { data, width, height };
}
