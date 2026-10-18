import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { acquireGenerationLock } from '../src/lock.js';
import type { Runtime } from '../src/runtime.js';
import { commit } from './git-fixture.js';
import { publicationGate, runtimeFixture } from './runtime-fixture.js';

async function wire(runtime: Runtime) {
  const server = createServer(runtime);
  const client = new Client({ name: 'raccoon-wire-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

for (const era of ['legacy', 'modern'] as const) test(`${era} stdio serves the validated MCP tool contract`, async (context) => {
  const { options } = await runtimeFixture(context);
  const client = new Client({ name: 'raccoon-wire-test', version: '1' }, {
    versionNegotiation: { mode: era === 'legacy' ? 'legacy' : { pin: '2026-07-28' } },
  });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('../src/main.ts', import.meta.url))],
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...getDefaultEnvironment(), RACCOON_REPOSITORIES: '{}',
      RACCOON_PROFILE_PATH: options.profilePath, RACCOON_STATE_DIRECTORY: options.stateDirectory },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(),
      ['begin_generation', 'cancel_generation', 'diff', 'history', 'inspect_pr', 'paths', 'publish_generation', 'read_file']);
    const result = await client.callTool({ name: 'inspect_pr', arguments: { repository: 'not/configured', pr: 1 } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /not explicitly configured/);
  } finally { await client.close(); }
});

test('MCP file pages retain actual Git line numbers', async (context) => {
  const { runtime, source } = await runtimeFixture(context);
  const { client, close } = await wire(runtime);
  try {
    const begun = await client.callTool({ name: 'begin_generation', arguments: { repository: source.repository, pr: 1, intent: { mode: 'create' } } });
    const block = begun.content[0]!;
    assert.equal(block.type, 'text');
    const { session } = JSON.parse('text' in block ? block.text : '');
    const result = await client.callTool({ name: 'read_file', arguments: { session, revision: source.headSha, path: 'src/main.ts', startLine: 2, count: 1 } });
    const content = result.content[0]!;
    assert.equal(content.type, 'text');
    assert.deepEqual(JSON.parse('text' in content ? content.text : '').lines, [{ line: 2, text: 'changed' }]);
  } finally { await close(); }
});

test('an oversized begin response releases its inaccessible session', async (context) => {
  const { runtime, source, git, options } = await runtimeFixture(context);
  const count = 12_000;
  for (let index = 0; index < count; index++) await writeFile(join(git.root, 'src', `${'a'.repeat(200)}-${index}.ts`), 'source\n');
  source.headSha = commit(git.root, 'Large inventory');
  const { client, close } = await wire(runtime);
  try {
    const result = await client.callTool({ name: 'begin_generation', arguments: { repository: source.repository, pr: 1, intent: { mode: 'create' } } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /Response exceeds/);
    const next = await acquireGenerationLock(options.stateDirectory, source.repository, 1);
    await next.release();
  } finally { await close(); }
});

test('MCP cancellation during begin releases the abandoned session', async (context) => {
  const { runtime, source, options } = await runtimeFixture(context);
  const gate = publicationGate();
  const inspect = runtime.inspect.bind(runtime);
  runtime.inspect = async (...args) => { await gate.beforeCommit(); return inspect(...args); };
  let finished!: () => void;
  const settled = new Promise<void>((resolve) => { finished = resolve; });
  const begin = runtime.begin.bind(runtime);
  runtime.begin = (...args) => { const pending = begin(...args); void pending.then(finished, finished); return pending; };
  const { client, close } = await wire(runtime);
  const controller = new AbortController();
  const request = client.callTool({ name: 'begin_generation', arguments: { repository: source.repository, pr: 1, intent: { mode: 'create' } } }, { signal: controller.signal });
  try {
    await gate.started;
    controller.abort();
    await assert.rejects(request);
    gate.release(); await settled;
    const next = await acquireGenerationLock(options.stateDirectory, source.repository, 1);
    await next.release();
  } finally { gate.release(); await settled; await close(); }
});
