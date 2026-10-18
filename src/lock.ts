import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { repository } from './contract.js';

export async function acquireGenerationLock(directory: string, name: string, pr: number) {
  repository.parse(name); z.number().int().positive().safe().parse(pr);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await realpath(directory);
  const info = await lstat(root);
  if (!info.isDirectory() || (info.mode & 0o077) || info.uid !== process.getuid?.()) throw new Error('Lock directory must be private and owned by this user');
  const key = createHash('sha256').update(`${name.toLowerCase()}\0${pr}`).digest('hex');
  const path = join(root, `${key}.lock`);
  const handle = await open(path, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error(`Generation active or interrupted. Stop its owning process before removing this exact lock: ${path}`);
    throw error;
  });
  const owner = await handle.stat();
  const session = randomUUID();
  let held = true;
  const release = async (): Promise<void> => {
    if (!held) return;
    held = false;
    try {
      const current = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      if (!current) return;
      if (current.dev !== owner.dev || current.ino !== owner.ino) throw new Error(`Lock ownership changed; preserve ${path}`);
      await unlink(path);
    } finally { await handle.close(); }
  };
  try { await handle.writeFile(JSON.stringify({ session, pid: process.pid, repository: name, pr, startedAt: new Date().toISOString() }) + '\n'); }
  catch (error) { await release(); throw error; }
  return { session, release };
}
