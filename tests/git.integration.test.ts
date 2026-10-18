import assert from 'node:assert/strict';
import test from 'node:test';
import { access, chmod, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Git } from '../src/git.js';
import { freeze } from '../src/snapshot.js';
import { commit, git, repositoryFixture } from './git-fixture.js';

test('frozen PR accounts for deleted paths and excluded commits', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/main.ts'), 'one\nchanged\nthree\n');
  const change = commit(root, 'Change handler');
  await unlink(join(root, 'src/main.ts'));
  const deletion = commit(root, 'Remove handler');
  await mkdir(join(root, 'raccoon-artifacts'));
  await writeFile(join(root, 'raccoon-artifacts/catalog.json'), '{}\n');
  const generated = commit(root, 'Learning artifact');
  git(root, ['commit', '--allow-empty', '-qm', 'CI trigger']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const snapshot = await freeze(await Git.open(root), { repository: 'bajor/example', pr: 1,
    title: 'Handler', branch: 'feature', baseSha: base, headSha: head });
  assert.deepEqual({ commits: snapshot.commits.map((item) => item.sha),
    changes: snapshot.changes.map((item) => [item.commit, item.path, item.status]), excluded: snapshot.excludedCommits }, {
    commits: [change, deletion], changes: [[change, 'src/main.ts', 'modified'], [deletion, 'src/main.ts', 'deleted']],
    excluded: [{ sha: generated, reason: 'generated-only' }, { sha: head, reason: 'no-source-change' }],
  });
});

test('partial clones are rejected before missing-object access', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const reader = await Git.open(root);
  const { blob } = await reader.file(base, 'src/main.ts');
  git(root, ['config', 'remote.origin.url', 'ssh://example.invalid/fixture']);
  git(root, ['config', 'remote.origin.promisor', 'true']);
  git(root, ['config', 'extensions.partialclone', 'origin']);
  git(root, ['config', 'core.sshCommand', join(root, 'must-not-execute')]);
  await unlink(join(root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  await assert.rejects(async () => (await Git.open(root)).file(base, 'src/main.ts'), /Partial Git clones require a complete local clone/);
});

test('local grafts cannot hide actual PR commits', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/main.ts'), 'middle\n');
  const middle = commit(root, 'Middle');
  await writeFile(join(root, 'src/main.ts'), 'head\n');
  const head = commit(root, 'Head');
  await writeFile(join(root, '.git/info/grafts'), `${head} ${base}\n`);
  const snapshot = await freeze(await Git.open(root), { repository: 'bajor/example', pr: 1,
    title: 'Real history', branch: 'feature', baseSha: base, headSha: head });
  assert.deepEqual(snapshot.commits.map((item) => [item.sha, item.parents]), [[middle, [base]], [head, [middle]]]);
});

test('path history pagination follows renames in skipped commits', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/main.ts'), 'one\ntwo\nthree\n');
  const middle = commit(root, 'Edit original name');
  git(root, ['mv', 'src/main.ts', 'src/renamed.ts']);
  const head = commit(root, 'Rename');
  const reader = await Git.open(root);
  assert.deepEqual((await reader.history(head, 1, 2, 'src/renamed.ts')).map((item) => item.sha), [middle, base]);
});

test('multiple merge bases never classify shared base commits as PR work', async (context) => {
  const { root, base: initial } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const tree = git(root, ['rev-parse', `${initial}^{tree}`]);
  const x = git(root, ['commit-tree', tree, '-p', initial, '-m', 'X']);
  const y = git(root, ['commit-tree', tree, '-p', initial, '-m', 'Y']);
  const base = git(root, ['commit-tree', tree, '-p', x, '-p', y, '-m', 'Base merge']);
  await writeFile(join(root, 'src/main.ts'), 'PR-specific\n');
  git(root, ['add', 'src/main.ts']);
  const changedTree = git(root, ['write-tree']);
  const head = git(root, ['commit-tree', changedTree, '-p', y, '-p', x, '-m', 'PR merge']);
  const snapshot = await freeze(await Git.open(root), { repository: 'bajor/example', pr: 1,
    title: 'Criss-cross history', branch: 'feature', baseSha: base, headSha: head });
  assert.deepEqual({ commits: snapshot.commits.map((item) => item.sha), excluded: snapshot.excludedCommits },
    { commits: [head], excluded: [] });
});

test('historical file reads ignore modified working-tree source', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/main.ts'), 'not committed\n');
  const file = await (await Git.open(root)).file(base, 'src/main.ts');
  assert.deepEqual({ text: file.text, bytes: file.data.toString('utf8'), lines: file.lines },
    { text: 'one\ntwo\n', bytes: 'one\ntwo\n', lines: 2 });
});

test('inspection never executes source Git filters or filesystem monitors', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const sentinel = join(root, 'executed');
  const script = join(root, 'hostile.sh');
  await writeFile(script, `#!/bin/sh\ntouch '${sentinel}'\ncat\n`);
  await chmod(script, 0o755);
  await writeFile(join(root, '.gitattributes'), 'src/main.ts filter=hostile diff=hostile\n');
  for (const key of ['filter.hostile.clean', 'filter.hostile.process', 'diff.hostile.textconv', 'diff.external', 'core.fsmonitor']) {
    git(root, ['config', key, script]);
  }
  const reader = await Git.open(root);
  await reader.text(['status', '--porcelain']);
  await reader.file(base, 'src/main.ts');
  await reader.diff(base, ['src/main.ts']);
  await assert.rejects(access(sentinel), { code: 'ENOENT' });
});

test('history pages expose older real commits', async (context) => {
  const { root, base } = await repositoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/main.ts'), 'later\n');
  const head = commit(root, 'Later mechanism');
  const reader = await Git.open(root);
  assert.deepEqual((await reader.history(head, 1, 1, 'src/main.ts')).map((item) => item.sha), [base]);
});
