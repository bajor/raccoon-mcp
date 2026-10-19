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
});

for (const orientation of ['landscape', 'portrait'] as const) test(`${orientation} separates fan-out labels`, () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.nodes.push({ id: 'b', label: 'B', refs: ['r1'] }, { id: 'c', label: 'C', refs: ['r1'] });
  diagram.edges = [{ from: 'handler', to: 'b', label: 'B'.repeat(80) }, { from: 'handler', to: 'c', label: 'C'.repeat(80) }];
  const [first, second] = layoutDiagram(diagram, orientation).edges.map((edge) => edge.label);
  assert.ok(first!.x + first!.width <= second!.x || second!.x + second!.width <= first!.x ||
    first!.y + first!.height <= second!.y || second!.y + second!.height <= first!.y);
});

for (const orientation of ['landscape', 'portrait'] as const) {
  test(`${orientation} attaches self-loop endpoints to their node`, () => {
    const diagram = draft().chapters[0]!.diagrams[0]!;
    diagram.edges = [{ from: 'handler', to: 'handler', label: 'retry' }];
    const result = layoutDiagram(diagram, orientation);
    const node = result.nodes[0]!;
    const points = result.edges[0]!.points;
    for (const point of [points[0]!, points.at(-1)!]) {
      const tolerance = 0.001;
      const onVertical = Math.abs(point.x - node.x) < tolerance || Math.abs(point.x - node.x - node.width) < tolerance;
      const onHorizontal = Math.abs(point.y - node.y) < tolerance || Math.abs(point.y - node.y - node.height) < tolerance;
      assert.ok((onVertical && point.y >= node.y && point.y <= node.y + node.height) ||
        (onHorizontal && point.x >= node.x && point.x <= node.x + node.width));
    }
  });
  test(`${orientation} includes complete self-loop labels in the viewport`, () => {
    const diagram = draft().chapters[0]!.diagrams[0]!;
    diagram.edges = [{ from: 'handler', to: 'handler', label: 'X'.repeat(80) }];
    const { width, height, edges } = layoutDiagram(diagram, orientation);
    const label = edges[0]!.label;
    assert.ok(label.x >= 0 && label.y >= 0 && label.x + label.width <= width && label.y + label.height <= height);
  });
}

test('valid contract IDs do not collide with graphlib object properties', () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.nodes[0]!.id = 'constructor';
  diagram.edges = [{ from: 'constructor', to: 'constructor', label: 'retry' }];
  const { width, height } = renderDiagram(diagram);
  assert.ok(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0);
});

for (const orientation of ['landscape', 'portrait'] as const) test(`${orientation} renders disconnected parallel-edge graphs`, () => {
  const diagram = draft().chapters[0]!.diagrams[0]!;
  diagram.nodes = ['idle', 'branch', 'sink', 'middle', 'source'].map((id) => ({ id, label: id, refs: ['r1'] }));
  diagram.edges = [
    { from: 'source', to: 'sink', label: 'accept' }, { from: 'source', to: 'sink', label: 'reject' },
    { from: 'source', to: 'sink', label: 'retry' }, { from: 'branch', to: 'middle', label: 'prepare' },
    { from: 'middle', to: 'sink', label: 'finish' }, { from: 'source', to: 'branch', label: 'dispatch' },
  ];
  const rendered = renderDiagram(diagram, orientation);
  assert.ok(Number.isFinite(rendered.width) && rendered.width > 0 && Number.isFinite(rendered.height) && rendered.height > 0);
});
