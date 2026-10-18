import type { Draft } from './contract.js';

type Diagram = Draft['threads'][number]['diagrams'][number];
const MAX_EDGES = 96;
const BOX_WIDTH = 280;
const BOX_HEIGHT = 110;
const COLUMN_GAP = 220;
const ROW_GAP = 65;
const MARGIN = 65;

function xml(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(value)) {
    throw new Error('Diagram label contains invalid XML characters');
  }
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

function ranks(diagram: Diagram): Map<string, number> {
  const result = new Map<string, number>();
  const remaining = new Set(diagram.nodes.map((node) => node.id));
  while (remaining.size) {
    const ready = [...remaining].filter((id) => diagram.edges.every((edge) => edge.to !== id || !remaining.has(edge.from)));
    if (!ready.length) break;
    for (const id of ready) {
      const parents = diagram.edges.filter((edge) => edge.to === id).map((edge) => result.get(edge.from) ?? -1);
      result.set(id, parents.length ? Math.max(...parents) + 1 : 0);
      remaining.delete(id);
    }
  }
  const cyclicRank = Math.max(-1, ...result.values()) + 1;
  for (const id of remaining) result.set(id, cyclicRank);
  return result;
}

function lines(label: string, limit = 30): string[] {
  const characters = [...label];
  const result: string[] = [];
  for (let start = 0; start < characters.length; start += limit) result.push(characters.slice(start, start + limit).join(''));
  return result;
}

export function layoutDiagram(diagram: Diagram) {
  if (diagram.edges.length > MAX_EDGES) throw new Error(`Diagram exceeds ${MAX_EDGES} edges; split it into smaller diagrams`);
  const levels = ranks(diagram);
  const edgeCounts = new Map<number, number>();
  const lanes = diagram.edges.map((edge) => {
    const rank = levels.get(edge.from)!;
    const lane = edgeCounts.get(rank) ?? 0;
    edgeCounts.set(rank, lane + 1);
    return lane;
  });
  const columns: number[] = [];
  let width = MARGIN;
  for (let rank = 0; rank <= Math.max(...levels.values()); rank++) {
    columns.push(width);
    width += BOX_WIDTH + COLUMN_GAP * Math.max(1, edgeCounts.get(rank) ?? 0);
  }
  width += MARGIN;
  const rows = new Map<number, number>();
  const points = new Map(diagram.nodes.map((node) => {
    const rank = levels.get(node.id)!;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    return [node.id, { x: columns[rank]!, y: MARGIN + row * (BOX_HEIGHT + ROW_GAP) }];
  }));
  const height = 2 * MARGIN + Math.max(...rows.values()) * (BOX_HEIGHT + ROW_GAP);
  const edges = diagram.edges.map((edge, index) => {
    const from = points.get(edge.from)!; const to = points.get(edge.to)!;
    const startX = from.x + BOX_WIDTH; const startY = from.y + BOX_HEIGHT / 2;
    const sameColumn = from.x === to.x;
    const endX = sameColumn ? to.x + BOX_WIDTH : to.x;
    const endY = to.y + BOX_HEIGHT / 2;
    const bendX = startX + COLUMN_GAP * (lanes[index]! + .5);
    const labelLines = lines(edge.label, 12);
    const labelY = (startY + endY) / 2;
    const path = edge.from === edge.to
      ? `M ${startX} ${startY - 20} H ${bendX} V ${startY + 20} H ${startX}`
      : `M ${startX} ${startY} H ${bendX} V ${endY} H ${endX}`;
    return { path, labelLines, label: { x: bendX - COLUMN_GAP / 2 + 8, y: labelY - labelLines.length * 8 - 4,
      width: COLUMN_GAP - 16, height: labelLines.length * 16 + 8 } };
  });
  return { width, height, points, edges };
}

export function renderDiagram(diagram: Diagram): Buffer {
  const { width, height, points, edges } = layoutDiagram(diagram);
  const paths = edges.map((edge) => `<path d="${edge.path}" fill="none" stroke="#82cdb9" stroke-width="2" marker-end="url(#arrow)"/>`);
  const labels = edges.map(({ label, labelLines }) =>
    `<rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" fill="#10171d"/>` +
    labelLines.map((line, index) => `<text x="${label.x + label.width / 2}" y="${label.y + 16 * (index + 1)}" font-size="13" fill="#e1e9ef" text-anchor="middle">${xml(line)}</text>`).join(''));
  const nodes = diagram.nodes.map((node) => {
    const { x, y } = points.get(node.id)!;
    const labelLines = lines(node.label);
    return `<g><title>${xml(node.label)}</title><rect x="${x}" y="${y}" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" rx="6" fill="#1b2b36" stroke="#82cdb9"/>` +
      labelLines.map((line, index) => `<text x="${x + BOX_WIDTH / 2}" y="${y + BOX_HEIGHT / 2 + (index - (labelLines.length - 1) / 2) * 17}" font-size="15" fill="#e1e9ef" text-anchor="middle">${xml(line)}</text>`).join('') + '</g>';
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(diagram.title)}" font-family="monospace">` +
    `<title>${xml(diagram.title)}</title><rect width="${width}" height="${height}" fill="#10171d"/>` +
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#82cdb9"/></marker></defs>' +
    paths.join('') + labels.join('') + nodes.join('') + '</svg>', 'utf8');
}
