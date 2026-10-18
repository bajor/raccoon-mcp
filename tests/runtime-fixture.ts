import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { Runtime } from '../src/runtime.js';
import { GitHubDouble, publicationFixture } from './publication-fixture.js';

export async function runtimeFixture(context: TestContext, beforeCommit?: () => Promise<void>) {
  const fixture = await publicationFixture(context);
  const privateRoot = await mkdtemp('/tmp/opencode/raccoon-runtime-');
  const profilePath = join(privateRoot, 'READER.md');
  await writeFile(profilePath, 'Private test preferences.', { mode: 0o600 });
  const options = { repositories: { [fixture.source.repository]: fixture.git.root }, stateDirectory: join(privateRoot, 'locks'), profilePath };
  const remote = new GitHubDouble(fixture.source, beforeCommit);
  const runtime = await Runtime.open(options, remote.github);
  context.after(async () => { await runtime.close(); await rm(privateRoot, { recursive: true, force: true }); });
  return { ...fixture, options, remote, runtime, privateRoot };
}

export function publicationGate() {
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  return { started, release, beforeCommit: async () => { start(); await blocked; } };
}
