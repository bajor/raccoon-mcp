import assert from 'node:assert/strict';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { acquireGenerationLock } from '../src/lock.js';
import { Runtime } from '../src/runtime.js';
import { GitHubDouble, previousFixture } from './publication-fixture.js';
import { publicationGate, runtimeFixture } from './runtime-fixture.js';

test('unconfigured repositories are rejected before GitHub access', async (context) => {
  const { runtime } = await runtimeFixture(context);
  await assert.rejects(runtime.inspect('other/repository', 1), /not explicitly configured/);
});

test('rejected regeneration setup releases its PR lock', async (context) => {
  const previous = await previousFixture(context);
  const fixture = await runtimeFixture(context);
  const runtime = await Runtime.open({ ...fixture.options, repositories: { [previous.source.repository]: previous.git.root } },
    new GitHubDouble(previous.source).github);
  context.after(() => runtime.close());
  await assert.rejects(runtime.begin(previous.source.repository, 1, { mode: 'create' }), /Generation intent does not match/);
  const started = await runtime.begin(previous.source.repository, 1, { mode: 'regenerate', expectedGeneration: previous.previous.manifest.generation });
  await runtime.cancel(started.session);
});

test('a rejected complete draft remains correctable in the same session', async (context) => {
  const { runtime, remote, source, draft } = await runtimeFixture(context);
  const started = await runtime.begin(source.repository, 1, { mode: 'create' });
  const invalid = structuredClone(draft); invalid.references[0]!.endLine = 99;
  await assert.rejects(runtime.finish(started.session, invalid), /exceeds the real file/);
  await runtime.finish(started.session, draft);
  assert.equal(remote.mutations.length, 1);
  assert.throws(() => runtime.session(started.session), /completed generation/);
});

test('in-flight finish excludes overlapping generation mutations', async (context) => {
  const gate = publicationGate();
  const { runtime, source, draft } = await runtimeFixture(context, gate.beforeCommit);
  const started = await runtime.begin(source.repository, 1, { mode: 'create' });
  const finishing = runtime.finish(started.session, draft);
  await gate.started;
  try {
    assert.throws(() => runtime.finish(started.session, draft), /already finishing/);
    await assert.rejects(runtime.cancel(started.session), /Cannot cancel/);
  } finally { gate.release(); await finishing; }
});

test('shutdown retains the PR lock until publication settles', async (context) => {
  const gate = publicationGate();
  const { runtime, options, source, draft } = await runtimeFixture(context, gate.beforeCommit);
  const started = await runtime.begin(source.repository, 1, { mode: 'create' });
  const finishing = runtime.finish(started.session, draft);
  await gate.started;
  const closing = runtime.close();
  try { await assert.rejects(acquireGenerationLock(options.stateDirectory, source.repository, 1), /Generation active or interrupted/); }
  finally { gate.release(); await finishing; await closing; }
  const next = await acquireGenerationLock(options.stateDirectory, source.repository, 1);
  await next.release();
});

test('a public reader profile cannot start a generation', async (context) => {
  const { runtime, source, options } = await runtimeFixture(context);
  await chmod(options.profilePath, 0o644);
  await assert.rejects(runtime.begin(source.repository, 1, { mode: 'create' }), /profile must be private/);
});

test('private runtime files cannot be placed inside source roots', async (context) => {
  const { options, git } = await runtimeFixture(context);
  const profilePath = join(git.root, 'private-profile');
  await writeFile(profilePath, 'Never publish this.', { mode: 0o600 });
  await assert.rejects(Runtime.open({ ...options, profilePath }), /outside every source root/);
});
