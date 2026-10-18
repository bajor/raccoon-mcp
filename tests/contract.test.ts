import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArtifact, validateDraft } from '../src/contract.js';
import { artifact, draft } from './fixture.js';

test('accepts a complete explanation graph without dropping content', () => {
  const input = draft();
  assert.deepEqual(validateDraft(input), input);
});

const brokenDrafts: Array<[string, (input: ReturnType<typeof draft>) => void]> = [
  ['dangling narrative reference', (input) => { input.threads[0]!.current[0]!.refs = ['missing']; }],
  ['duplicate change ownership', (input) => { input.assignments.push(input.assignments[0]!); }],
  ['unknown primary thread', (input) => { input.assignments[0]!.thread = 'missing'; }],
  ['dangling diagram endpoint', (input) => { input.threads[0]!.diagrams[0]!.edges.push({ from: 'handler', to: 'missing', label: '' }); }],
  ['reversed source range', (input) => { input.references[0]!.startLine = 3; }],
  ['agent-supplied code block', (input) => { input.threads[0]!.current[0]!.text = '```ts\nmadeUp()\n```'; }],
];
for (const [name, breakInput] of brokenDrafts) {
  test(`rejects ${name}`, () => {
    const input = draft();
    breakInput(input);
    assert.throws(() => validateDraft(input));
  });
}

test('rejects an artifact whose source file does not contain the referenced lines', () => {
  const input = artifact();
  input.files[0]!.lines = 1;
  assert.throws(() => validateArtifact(input), /out-of-range/);
});

test('rejects an artifact missing a required diagram asset', () => {
  const input = artifact();
  input.diagrams = [];
  assert.throws(() => validateArtifact(input));
});

test('rejects an artifact whose timeline points outside its commit list', () => {
  const input = artifact();
  input.commits[0]!.sha = 'c'.repeat(40);
  assert.throws(() => validateArtifact(input), /Unknown stage commit/);
});

test('rejects source asset aliases outside the content-addressed file store', () => {
  const input = artifact();
  input.files[0]!.file = 'catalog.json';
  assert.throws(() => validateArtifact(input), /Noncanonical source asset/);
});
