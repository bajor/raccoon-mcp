import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';
import { acquireGenerationLock } from '../src/lock.js';

const execute = promisify(execFile);
const child = (directory: string) => execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  `import { acquireGenerationLock } from './src/lock.ts'; await acquireGenerationLock(process.argv[1], 'BAJOR/Example', 1);`, directory],
{ cwd: new URL('..', import.meta.url), timeout: 10_000 });

test('one canonical PR lock excludes a second process', async (context) => {
  const directory = await mkdtemp('/tmp/opencode/raccoon-lock-');
  context.after(() => rm(directory, { recursive: true, force: true }));
  const lock = await acquireGenerationLock(directory, 'bajor/example', 1);
  try { await assert.rejects(child(directory), /Generation active or interrupted/); } finally { await lock.release(); }
});

test('a dead process lock is not automatically stolen', async (context) => {
  const directory = await mkdtemp('/tmp/opencode/raccoon-lock-');
  context.after(() => rm(directory, { recursive: true, force: true }));
  await child(directory);
  await assert.rejects(acquireGenerationLock(directory, 'bajor/example', 1), /Generation active or interrupted/);
});

test('releasing an old session cannot release its successor lock', async (context) => {
  const directory = await mkdtemp('/tmp/opencode/raccoon-lock-');
  context.after(() => rm(directory, { recursive: true, force: true }));
  const first = await acquireGenerationLock(directory, 'bajor/example', 1);
  await first.release();
  const second = await acquireGenerationLock(directory, 'bajor/example', 1);
  try {
    await first.release();
    await assert.rejects(acquireGenerationLock(directory, 'bajor/example', 1), /Generation active or interrupted/);
  } finally { await second.release(); }
});
