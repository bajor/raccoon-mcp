import assert from 'node:assert/strict';
import test from 'node:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildArtifact, checksum } from '../src/package.js';
import { git as runGit } from './git-fixture.js';
import { currentText, packageFixture } from './package-fixture.js';

test('complete historical assets come from Git rather than dirty source', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  await writeFile(join(git.root, 'src/main.ts'), 'dirty source must not enter the artifact\n');
  const result = await buildArtifact(git, source, draft, Buffer.from('private profile'));
  const files = result.manifest.files;
  assert.deepEqual(files.map((file) => ({ content: result.assets.get(file.file)!.toString(), bytes: file.bytes, lines: file.lines })),
    [{ content: currentText, bytes: Buffer.byteLength(currentText), lines: 3 }, { content: 'one\ntwo\n', bytes: 8, lines: 2 }]);
});

test('selected older stages precede PR stages in the packaged timeline', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  const result = await buildArtifact(git, source, draft, Buffer.from('private profile'));
  assert.deepEqual(result.manifest.commits.map((commit) => [commit.sha, commit.phase]),
    [[source.baseSha, 'before-pr'], [source.headSha, 'pr']]);
});

for (const [name, alter, message] of [
  ['out-of-range reference', (draft: Awaited<ReturnType<typeof packageFixture>>['draft']) => { draft.references[0]!.endLine = 50; }, /exceeds the real file/],
  ['unowned source change', (draft: Awaited<ReturnType<typeof packageFixture>>['draft']) => { draft.assignments[0]!.change = 'invented'; }, /Unknown change|Unassigned changes/],
  ['future stage evidence', (draft: Awaited<ReturnType<typeof packageFixture>>['draft']) => { draft.threads[0]!.stages[0]!.blocks[0]!.refs = ['current', 'older']; }, /did not exist at diagram\/stage/],
] as const) test(`rejects an entire package with ${name}`, async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  alter(draft);
  await assert.rejects(buildArtifact(git, source, draft, Buffer.from('private')), message);
});

test('unrelated selected history cannot enter a package', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  const tree = runGit(git.root, ['rev-parse', `${source.baseSha}^{tree}`]);
  const unrelated = runGit(git.root, ['commit-tree', tree, '-m', 'Unrelated root']);
  draft.references[1]!.commit = unrelated;
  draft.threads[0]!.stages[0]!.commit = unrelated;
  await assert.rejects(buildArtifact(git, source, draft, Buffer.from('private')), /not a shared ancestor/);
});

test('package stores the private profile hash without its contents', async (context) => {
  const { git, source, draft } = await packageFixture();
  context.after(() => rm(git.root, { recursive: true, force: true }));
  const profile = Buffer.from('Only a profile hash may be published. UNIQUE_PRIVATE_PROFILE');
  const result = await buildArtifact(git, source, draft, profile);
  assert.equal(result.manifest.profileHash, checksum(profile));
  for (const bytes of result.assets.values()) assert.equal(bytes.includes(profile), false);
});
