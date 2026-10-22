import assert from 'node:assert/strict';
import test from 'node:test';
import { authoringDraftSchema } from '../src/authoring.js';
import { draft } from './fixture.js';

const words = (count: number): string => Array(count).fill('word').join(' ');
function visualDraft() {
  const input = draft();
  input.references.push({ ...input.references[0]!, id: 'context', startLine: 3, endLine: 4 });
  input.chapters[0]!.sections[0]!.blocks = [
    { kind: 'diagram', diagram: 'request' },
    { kind: 'prose', text: 'The caller supplies the request.', evidence: 'fact', refs: ['r1', 'context'] },
    { kind: 'code', reference: 'r1' }, { kind: 'code', reference: 'context' },
  ];
  return input;
}

test('accepts a complete visual-first draft', () => {
  const input = visualDraft();
  assert.deepEqual(authoringDraftSchema.parse(input), input);
});

const failures: Array<[string, (input: ReturnType<typeof visualDraft>) => void, RegExp]> = [
  ['long introduction', (d) => { d.introduction = words(61); }, /at most 60 words/],
  ['long history note', (d) => { d.historyNote = words(81); }, /at most 80 words/],
  ['long summary', (d) => { d.chapters[0]!.summary = words(31); }, /at most 30 words/],
  ['long caption', (d) => { d.chapters[0]!.sections[0]!.blocks.find((b) => b.kind === 'prose')!.text = words(61); }, /at most 60 words/],
  ['long section', (d) => {
    const blocks = d.chapters[0]!.sections[0]!.blocks;
    const caption = blocks.find((b) => b.kind === 'prose')!;
    caption.text = words(41); blocks.push({ ...caption }, { ...caption });
  }, /total at most 120 words/],
  ['source dump', (d) => { d.references[0]!.endLine = 81; }, /within 80 lines/],
  ['dense graph', (d) => {
    const graph = d.chapters[0]!.diagrams[0]!;
    for (let i = 1; i < 9; i++) graph.nodes.push({ id: `node${i}`, label: 'Node', refs: ['r1'] });
  }, /exceeding 8 nodes/],
  ['dense edges', (d) => { d.chapters[0]!.diagrams[0]!.edges = Array.from({ length: 13 }, () => ({ from: 'handler', to: 'handler', label: '' })); }, /12 edges/],
  ['code-first chapter', (d) => { d.chapters[0]!.sections[0]!.blocks.reverse(); }, /Open the chapter with a diagram/],
  ['missing context code', (d) => { d.chapters[0]!.sections[0]!.blocks.pop(); }, /two distinct current code ranges/],
  ['aliased context code', (d) => { d.references[1] = { ...d.references[0]!, id: 'context' }; }, /two distinct current code ranges/],
  ['history without code', (d) => {
    const section = structuredClone(d.chapters[0]!.sections[0]!);
    section.blocks = section.blocks.filter((b) => b.kind !== 'code');
    d.chapters[0]!.sections.push(section);
  }, /Every section needs inline code/],
  ['prose-heavy section', (d) => {
    const blocks = d.chapters[0]!.sections[0]!.blocks;
    const caption = blocks.find((b) => b.kind === 'prose')!;
    blocks.push({ ...caption }, { ...caption }, { ...caption });
  }, /cannot outnumber/],
];
for (const [name, alter, message] of failures) test(`rejects ${name}`, () => {
  const input = visualDraft(); alter(input);
  assert.throws(() => authoringDraftSchema.parse(input), message);
});
