import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHub } from '../src/github.js';
import { artifact } from './fixture.js';

for (const scenario of ['closed', 'fork'] as const) test(`discovery rejects a ${scenario} PR`, async () => {
  const { source } = artifact();
  const github = new GitHub(async () => ({ number: 1, title: 'Handler', state: scenario === 'closed' ? 'closed' : 'open',
    base: { sha: source.baseSha, repo: { full_name: source.repository } },
    head: { sha: source.headSha, ref: source.branch, repo: { full_name: scenario === 'fork' ? 'other/fork' : source.repository } },
  }));
  await assert.rejects(github.discover(source.repository, 1), /must be open|separately authorized/);
});
