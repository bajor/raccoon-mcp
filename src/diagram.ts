import type { Draft } from './contract.js';

type Diagram = Draft['threads'][number]['diagrams'][number];
const MAX_EDGES = 96;
const BOX_WIDTH = 280;
const BOX_HEIGHT = 110;
const COLUMN_GAP = 140;
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

function lines(label: string): string[] {
  const characters = [...label];
  const result: string[] = [];
  for (let start = 0; start < characters.length; start += 30) result.push(characters.slice(start, start + 30).join(''));
  return result;
}

export function renderDiagram(diagram: Diagram): Buffer {
  if (diagram.edges.length > MAX_EDGES) throw new Error(`Diagram exceeds ${MAX_EDGES} edges; split it into smaller diagrams`);
  const levels = ranks(diagram);
  const rows = new Map<number, number>();
  const points = new Map(diagram.nodes.map((node) => {
    const rank = levels.get(node.id)!;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    return [node.id, { x: MARGIN + rank * (BOX_WIDTH + COLUMN_GAP), y: MARGIN + row * (BOX_HEIGHT + ROW_GAP) }];
  }));
  const width = 2 * MARGIN + (Math.max(...levels.values()) + 1) * (BOX_WIDTH + COLUMN_GAP);
  const height = 2 * MARGIN + Math.max(...rows.values()) * (BOX_HEIGHT + ROW_GAP);
  const edges = diagram.edges.map((edge, index) => {
    const from = points.get(edge.from)!; const to = points.get(edge.to)!;
    const startX = from.x + BOX_WIDTH; const startY = from.y + BOX_HEIGHT / 2;
    const sameColumn = from.x === to.x;
    const endX = sameColumn ? to.x + BOX_WIDTH : to.x;
    const endY = to.y + BOX_HEIGHT / 2;
    const bendX = sameColumn ? startX + 40 + index % 5 * 16 : (startX + endX) / 2;
    const path = edge.from === edge.to
      ? `M ${startX} ${startY - 15} C ${startX + 90} ${startY - 85}, ${startX + 90} ${startY + 85}, ${startX} ${startY + 15}`
      : `M ${startX} ${startY} C ${bendX} ${startY}, ${bendX} ${endY}, ${endX} ${endY}`;
    return `<path d="${path}" fill="none" stroke="#82cdb9" stroke-width="2" marker-end="url(#arrow)"/>` +
      `<text x="${bendX}" y="${(startY + endY) / 2 - 8}" font-size="13" fill="#e1e9ef" text-anchor="middle">${xml(edge.label)}</text>`;
  });
  const nodes = diagram.nodes.map((node) => {
    const { x, y } = points.get(node.id)!;
    const labelLines = lines(node.label);
    return `<g><title>${xml(node.label)}</title><rect x="${x}" y="${y}" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" rx="6" fill="#1b2b36" stroke="#82cdb9"/>` +
      labelLines.map((line, index) => `<text x="${x + BOX_WIDTH / 2}" y="${y + BOX_HEIGHT / 2 + (index - (labelLines.length - 1) / 2) * 17}" font-size="15" fill="#e1e9ef" text-anchor="middle">${xml(line)}</text>`).join('') + '</g>';
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(diagram.title)}" font-family="monospace">` +
    `<title>${xml(diagram.title)}</title><rect width="${width}" height="${height}" fill="#10171d"/>` +
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#82cdb9"/></marker></defs>' +
    edges.join('') + nodes.join('') + '</svg>', 'utf8');
}
