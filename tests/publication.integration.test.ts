import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { publishArtifact } from '../src/publication.js';
import { git as runGit } from './git-fixture.js';
import { advance, GitHubDouble, previousFixture, publicationFixture } from './publication-fixture.js';

test('first publication submits one complete artifact-only commit', async (context) => {
  const { git, source, pkg } = await publicationFixture(context);
  const remote = new GitHubDouble(source);
  await publishArtifact(git, remote.github, pkg, null);
  assert.equal(remote.mutations.length, 1);
  assert.match(remote.mutations[0]!.query, /createCommitOnBranch/);
  assert.equal(remote.mutations[0]!.variables.input.expectedHeadOid, source.headSha);
  assert.deepEqual(remote.changes.deletions, []);
  const actual = new Map(remote.changes.additions.map((file) => [file.path, Buffer.from(file.contents, 'base64')]));
  for (const [path, bytes] of pkg.assets) assert.deepEqual(actual.get(`raccoon-artifacts/pr-1/${path}`), bytes);
  assert.equal(actual.size, pkg.assets.size + 1);
  assert.deepEqual(JSON.parse(actual.get('raccoon-artifacts/catalog.json')!.toString()).artifacts, [{ pr: 1, manifest: 'pr-1/manifest.json' }]);
});

test('publication preserves all local source state', async (context) => {
  const { git, source, pkg } = await publicationFixture(context);
  await writeFile(join(git.root, 'src/main.ts'), 'staged source\n');
  runGit(git.root, ['add', 'src/main.ts']);
  await writeFile(join(git.root, 'src/main.ts'), 'unstaged source\n');
  const tree = runGit(git.root, ['write-tree']);
  await publishArtifact(git, new GitHubDouble(source).github, pkg, null);
  assert.equal(await readFile(join(git.root, 'src/main.ts'), 'utf8'), 'unstaged source\n');
  assert.equal(runGit(git.root, ['write-tree']), tree);
  assert.equal(runGit(git.root, ['rev-parse', 'HEAD']), source.headSha);
});

test('expected regeneration replaces only the target managed assets', async (context) => {
  const { git, source, pkg, previous } = await previousFixture(context);
  const remote = new GitHubDouble(source);
  await publishArtifact(git, remote.github, pkg, previous.manifest.generation);
  assert.deepEqual(remote.changes.deletions, ['landscape', 'portrait'].map((layout) =>
    ({ path: `raccoon-artifacts/pr-1/diagrams/handler/obsolete-${layout}.svg` })));
  const catalog = remote.changes.additions.find((file) => file.path === 'raccoon-artifacts/catalog.json')!;
  assert.deepEqual(JSON.parse(Buffer.from(catalog.contents, 'base64').toString()).artifacts,
    [{ pr: 1, manifest: 'pr-1/manifest.json' }, { pr: 2, manifest: 'pr-2/manifest.json' }]);
  assert.ok(!remote.changes.additions.some((file) => file.path.endsWith('notes.md') || file.path.startsWith('raccoon-artifacts/pr-2/')));
});

test('previous generation cannot be replaced without its UUID', async (context) => {
  const { git, source, pkg } = await previousFixture(context);
  const remote = new GitHubDouble(source);
  await assert.rejects(publishArtifact(git, remote.github, pkg, null), /Expected generation/);
  assert.equal(remote.mutations.length, 0);
});

test('a stale PR head rejects publication before mutation', async (context) => {
  const { git, source, pkg } = await publicationFixture(context);
  const remote = new GitHubDouble({ ...source, headSha: 'f'.repeat(40) });
  await assert.rejects(publishArtifact(git, remote.github, pkg, null), /PR source changed/);
  assert.equal(remote.mutations.length, 0);
});

test('an incomplete package never reaches publication', async (context) => {
  const { git, source, pkg } = await publicationFixture(context);
  pkg.assets.delete(pkg.manifest.files[0]!.file);
  const remote = new GitHubDouble(source);
  await assert.rejects(publishArtifact(git, remote.github, pkg, null), /Incomplete/);
  assert.equal(remote.mutations.length, 0);
});

for (const path of ['raccoon-artifacts', 'raccoon-artifacts/pr-1/manifest.json']) {
  test(`publication preserves unowned collision at ${path}`, async (context) => {
    const fixture = await publicationFixture(context);
    const destination = join(fixture.git.root, path);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, 'Keep this private note.');
    const pkg = await advance(fixture);
    const remote = new GitHubDouble(fixture.source);
    await assert.rejects(publishArtifact(fixture.git, remote.github, pkg, null), /collision|not a directory/);
    assert.equal(remote.mutations.length, 0);
  });
}
