import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutDiagram, renderDiagram } from '../src/diagram.js';
import { draft } from './fixture.js';

test('diagram labels become literal text rather than executable markup', () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.nodes[0]!.label = '<script>alert("x")</script> & caller';
  const svg = renderDiagram(diagram).data.toString();
  assert.ok(svg.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; caller'));
  assert.ok(!svg.includes('<script>'));
});

test('diagram labels with invalid XML characters are rejected', () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.title = 'bad\u0001label';
  assert.throws(() => renderDiagram(diagram), /invalid XML characters/);
});

for (const orientation of ['landscape', 'portrait'] as const) test(`${orientation} keeps branching and cyclic graph geometry inside the viewport`, () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.nodes.push({ id: 'b', label: 'B', refs: ['r1'] }, { id: 'c', label: 'C', refs: ['r1'] });
  diagram.edges = [{ from: 'handler', to: 'b', label: 'B'.repeat(80) }, { from: 'handler', to: 'c', label: 'C'.repeat(80) }];
  diagram.edges.push({ from: 'b', to: 'handler', label: 'cycle' }, { from: 'c', to: 'c', label: 'retry' });
  const result = layoutDiagram(diagram, orientation);
  for (const box of [...result.nodes, ...result.edges.map((edge) => edge.label)]) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= result.width && box.y + box.height <= result.height);
  }
  for (const point of result.edges.flatMap((edge) => edge.points)) {
    assert.ok(point.x >= 0 && point.y >= 0 && point.x <= result.width && point.y <= result.height);
  }
  const [first, second] = result.edges.map((edge) => edge.label);
  assert.ok(first!.x + first!.width <= second!.x || second!.x + second!.width <= first!.x ||
    first!.y + first!.height <= second!.y || second!.y + second!.height <= first!.y);
});
