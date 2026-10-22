import assert from 'node:assert/strict';
import test from 'node:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkComparisons } from '../src/comparison.js';
import { buildArtifact } from '../src/package.js';
import { freeze } from '../src/snapshot.js';
import { commit } from './git-fixture.js';
import { packageFixture } from './package-fixture.js';

test('paired comparisons retain complete authoritative Git files', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  draft.chapters[0]!.sections[0]!.blocks.push({ kind: 'diff', before: 'older', after: 'current' });
  const result = await buildArtifact(git, source, draft, Buffer.from('private'));
  const texts = ['older', 'current'].map((id) => result.assets.get(result.manifest.files.find((file) => file.reference === id)!.file)!.toString());
  assert.deepEqual(texts, ['one\ntwo\n', 'one\nchanged\nthree\n']);
});

test('a modified file cannot be presented as newly added', async (context) => {
  const { git, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  draft.chapters[0]!.sections[0]!.blocks.push({ kind: 'diff', before: null, after: 'current' });
  await assert.rejects(checkComparisons(git, draft), /exists in the first parent/);
});

test('deletion comparisons require actual absence at the result revision', async (context) => {
  const { git, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  draft.chapters[0]!.sections[0]!.blocks.push({ kind: 'diff', before: 'older', after: null });
  await assert.rejects(checkComparisons(git, draft), /absence at the section/);
});

test('an existing empty file remains distinct from an absent diff side', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  await writeFile(join(git.root, 'src/main.ts'), '');
  await writeFile(join(git.root, 'src/context.py'), 'run()\n');
  const head = commit(git.root, 'Empty handler');
  draft.references[0] = { ...draft.references[0]!, commit: head, startLine: 0, endLine: 0 };
  const section = draft.chapters[0]!.sections[0]!;
  section.commit = head;
  section.blocks = section.blocks.filter((block) => block.kind !== 'code' || block.reference !== 'current');
  section.blocks.push({ kind: 'diff', before: 'older', after: 'current' });
  draft.references[2] = { ...draft.references[2]!, commit: head, path: 'src/context.py' };
  draft.chapters[0]!.diagrams[0]!.commit = head;
  const snapshot = await freeze(git, { ...source, headSha: head });
  draft.assignments = snapshot.changes.map((change) => ({ change: change.id, chapter: 'handler' }));
  draft.chapters[0]!.sections.push({ commit: source.headSha, title: 'Earlier change', blocks: [
    { kind: 'code', reference: 'older' }, { kind: 'prose', text: 'The previous change.', evidence: 'fact', refs: ['older'] },
  ] });
  const result = await buildArtifact(git, { ...source, headSha: head }, draft, Buffer.from('private'));
  const file = result.manifest.files.find((file) => file.reference === 'current')!;
  assert.equal(result.assets.get(file.file)!.length, 0);
});
