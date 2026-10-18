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
  ['case-ambiguous filename ID', (input) => { input.threads[0]!.id = 'Flow'; input.assignments[0]!.thread = 'Flow'; }],
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
  ['unexplained PR change', (input) => { input.changes.push({ ...input.changes[0]!, id: 'c2', path: 'src/other.ts' }); }, /Unassigned changes/],
  ['duplicate changed path', (input) => { input.changes.push({ ...input.changes[0]!, id: 'c2' }); input.content.assignments.push({ change: 'c2', thread: 'flow' }); }, /Duplicate changed path/],
  ['invented change assignment', (input) => { input.content.assignments[0]!.change = 'invented'; }, /Unknown change/],
  ['change assigned outside its commit stage', (input) => { input.content.threads[0]!.stages[0]!.commit = 'd'.repeat(40); }, /Assigned change has no stage/],
  ['non-PR source change', (input) => { input.commits[0]!.phase = 'before-pr'; }, /Change must belong to a PR commit/],
  ['inconsistent deduplicated file metadata', (input) => {
    input.content.references.push({ ...input.content.references[0]!, id: 'r2', endLine: 900 });
    input.files.push({ ...input.files[0]!, reference: 'r2', lines: 900 });
    input.content.threads[0]!.current[0]!.refs.push('r2');
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
  const earlier = input.source.baseSha;
  input.commits.unshift({ sha: earlier, subject: 'Earlier context', parents: [], phase: 'before-pr' });
  input.content.threads[0]!.stages.push({ ...input.content.threads[0]!.stages[0]!, commit: earlier });
  assert.throws(() => validateArtifact(input), /Stages must be in ancestor-first order/);
});

test('rejects a base revision classified as part of the PR', () => {
  const input = artifact(); input.source.baseSha = input.source.headSha;
  assert.throws(() => validateArtifact(input), /Base and merge base cannot be PR commits/);
});

test('represents an artifact-only PR head without inventing an explanation stage', () => {
  const input = artifact(); input.source.headSha = 'd'.repeat(40);
  input.excludedCommits.push({ sha: input.source.headSha, reason: 'generated-only' });
  assert.deepEqual(validateArtifact(input), input);
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
