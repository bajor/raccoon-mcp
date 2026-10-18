import assert from 'node:assert/strict';
import test from 'node:test';
import { access, chmod, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Git } from '../src/git.js';
import { freeze } from '../src/snapshot.js';
import { commit, git, repositoryFixture } from './git-fixture.js';

test('frozen PR accounts for reverted paths and excluded commits', async (context) => {
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
