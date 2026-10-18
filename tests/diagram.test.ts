import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDiagram } from '../src/diagram.js';
import { draft } from './fixture.js';

test('diagram labels become literal text rather than executable markup', () => {
  const diagram = draft().threads[0]!.diagrams[0]!;
  diagram.nodes[0]!.label = '<script>alert("x")</script> & caller';
  const svg = renderDiagram(diagram).toString();
  assert.ok(svg.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; caller'));
  assert.ok(!svg.includes('<script>'));
});

test('diagram labels with invalid XML characters are rejected', () => {
  const diagram = draft().threads[0]!.diagrams[0]!;
  diagram.title = 'bad\u0001label';
  assert.throws(() => renderDiagram(diagram), /invalid XML characters/);
});
