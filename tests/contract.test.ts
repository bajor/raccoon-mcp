import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactSchema, catalogSchema, validateArtifact, validateDraft } from '../src/contract.js';
import { artifact, draft } from './fixture.js';

test('accepts a complete explanation graph without dropping content', () => {
  const input = draft();
  assert.deepEqual(validateDraft(input), input);
});

test('accepts a complete packaged artifact through the exported schema', () => {
  const input = artifact();
  assert.deepEqual(artifactSchema.parse(input), input);
});

const brokenDrafts: Array<[string, (input: ReturnType<typeof draft>) => void]> = [
  ['dangling narrative reference', (input) => { input.threads[0]!.current[0]!.refs = ['missing']; }],
  ['duplicate change ownership', (input) => { input.assignments.push(input.assignments[0]!); }],
  ['unknown primary thread', (input) => { input.assignments[0]!.thread = 'missing'; }],
  ['dangling diagram endpoint', (input) => { input.threads[0]!.diagrams[0]!.edges.push({ from: 'handler', to: 'missing', label: '' }); }],
  ['reversed source range', (input) => { input.references[0]!.startLine = 3; }],
  ['agent-supplied code block', (input) => { input.threads[0]!.current[0]!.text = '```ts\nmadeUp()\n```'; }],
  ['indented source block', (input) => { input.threads[0]!.current[0]!.text = 'Intro.\n\n    madeUp();'; }],
  ['HTML source block', (input) => { input.threads[0]!.current[0]!.text = '<pre><code>madeUp()</code></pre>'; }],
  ['case-ambiguous filename ID', (input) => { input.threads[0]!.id = 'Flow'; }],
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
  input.diagrams[0]!.diagram = 'other';
  input.diagrams[0]!.file = 'diagrams/flow/other.svg';
  assert.throws(() => validateArtifact(input), /Missing diagram flow\/request/);
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

const brokenArtifacts: Array<[string, (input: ReturnType<typeof artifact>) => void, RegExp]> = [
  ['orphan diagram asset', (input) => { input.diagrams.push({ ...input.diagrams[0]!, diagram: 'extra', file: 'diagrams/flow/extra.svg' }); }, /Extra diagram/],
  ['unknown reference revision', (input) => { input.content.references[0]!.commit = 'd'.repeat(40); }, /Unknown reference commit/],
  ['unknown diagram revision', (input) => { input.content.threads[0]!.diagrams[0]!.commit = 'd'.repeat(40); }, /Unknown diagram commit/],
  ['unexplained PR change', (input) => { input.changes.push({ ...input.changes[0]!, id: 'c2' }); }, /Unassigned changes/],
  ['invented change assignment', (input) => { input.content.assignments[0]!.change = 'invented'; }, /Unknown change/],
  ['change assigned outside its commit stage', (input) => { input.content.threads[0]!.stages[0]!.commit = 'd'.repeat(40); }, /Assigned change has no stage/],
  ['non-PR source change', (input) => { input.commits[0]!.phase = 'before-pr'; }, /Change must belong to a PR commit/],
  ['inconsistent deduplicated file metadata', (input) => {
    input.content.references.push({ ...input.content.references[0]!, id: 'r2', endLine: 900 });
    input.files.push({ ...input.files[0]!, reference: 'r2', lines: 900 });
  }, /Inconsistent metadata/],
];
for (const [name, breakInput, message] of brokenArtifacts) {
  test(`rejects ${name}`, () => {
    const input = artifact();
    breakInput(input);
    assert.throws(() => artifactSchema.parse(input), message);
  });
}

test('rejects a reversed thread timeline', () => {
  const input = artifact();
  const later = 'd'.repeat(40);
  input.commits.push({ sha: later, subject: 'Later context', parents: [input.commits[0]!.sha], phase: 'before-pr' });
  input.content.threads[0]!.stages.unshift({ ...input.content.threads[0]!.stages[0]!, commit: later });
  assert.throws(() => validateArtifact(input), /Stages must be in ancestor-first order/);
});

test('accepts an authoritative empty repository catalog', () => {
  assert.deepEqual(catalogSchema.parse({ version: 1, repository: 'bajor/example', artifacts: [] }).artifacts, []);
});

for (const [name, artifacts, message] of [
  ['duplicate PR', [{ pr: 1, manifest: 'pr-1/manifest.json' }, { pr: 1, manifest: 'pr-1/manifest.json' }], /Duplicate PR/],
  ['manifest alias', [{ pr: 1, manifest: 'elsewhere.json' }], /Noncanonical manifest/],
] as const) {
  test(`rejects catalog ${name}`, () => {
    assert.throws(() => catalogSchema.parse({ version: 1, repository: 'bajor/example', artifacts }), message);
  });
}

test('rejects a traversal-shaped repository identity', () => {
  assert.throws(() => catalogSchema.parse({ version: 1, repository: '../..', artifacts: [] }));
});
