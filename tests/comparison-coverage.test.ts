import assert from 'node:assert/strict';
import test from 'node:test';
import { requireComparisons } from '../src/authoring.js';
import { artifact, base } from './fixture.js';

function comparison(status: 'added' | 'modified' | 'deleted' = 'modified') {
  const input = artifact();
  input.changes[0]!.status = status;
  input.content.references.push({ ...input.content.references[0]!, id: 'before', commit: base });
  const block = { kind: 'diff' as const, before: status === 'added' ? null : 'before', after: status === 'deleted' ? null : 'r1' };
  input.content.chapters[0]!.sections[0]!.blocks.push(block);
  return { input, block };
}

for (const status of ['added', 'modified', 'deleted'] as const) test(`accepts exact ${status} comparison coverage`, () => {
  const { input } = comparison(status);
  requireComparisons(input, input.content);
});

for (const [name, alter] of [
  ['another path', (input: ReturnType<typeof artifact>) => { input.content.references[0]!.path = 'other.py'; }],
  ['an older baseline', (input: ReturnType<typeof artifact>) => { input.content.references[1]!.commit = 'c'.repeat(40); }],
  ['a secondary chapter', (input: ReturnType<typeof artifact>) => {
    const owner = input.content.chapters[0]!;
    input.content.chapters.push({ ...structuredClone(owner), id: 'secondary' });
    owner.sections[0]!.blocks = owner.sections[0]!.blocks.filter((block) => block.kind !== 'diff');
  }],
] as const) test(`rejects comparison coverage from ${name}`, () => {
  const { input } = comparison(); alter(input);
  assert.throws(() => requireComparisons(input, input.content), /needs a first-parent diff/);
});
