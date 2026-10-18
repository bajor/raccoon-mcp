import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { repository } from './contract.js';
import { Runtime, type RuntimeOptions } from './runtime.js';
import { createServer } from './server.js';

const options: RuntimeOptions = {
  repositories: z.record(repository, z.string().min(1)).parse(JSON.parse(process.env.RACCOON_REPOSITORIES ?? '{}')),
  stateDirectory: process.env.RACCOON_STATE_DIRECTORY ?? join(homedir(), '.local/state/raccoon'),
  profilePath: process.env.RACCOON_PROFILE_PATH ?? join(homedir(), '.config/raccoon/READER.md'),
};
const runtimes = new Set<Runtime>();
const report = (error: unknown): void => { console.error(error instanceof Error ? error.message : 'Raccoon MCP failed'); };
const serving = serveStdio(async () => {
  const runtime = await Runtime.open(options);
  runtimes.add(runtime);
  const server = createServer(runtime);
  server.server.onclose = () => { void runtime.close().catch(report).finally(() => runtimes.delete(runtime)); };
  return server;
}, { onerror: report });

const shutdown = async (): Promise<void> => {
  await serving.close();
  await Promise.all([...runtimes].map((runtime) => runtime.close()));
};
process.once('SIGTERM', () => { void shutdown().catch(report); });
process.once('SIGINT', () => { void shutdown().catch(report); });
