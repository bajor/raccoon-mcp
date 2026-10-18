import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function repositoryFixture(): Promise<{ root: string; base: string }> {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'raccoon-git-'));
  git(root, ['init', '-q', '-b', 'feature']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/main.ts'), 'one\ntwo\n');
  return { root, base: commit(root, 'Existing mechanism') };
}

export function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();
}

export function commit(root: string, message: string): string {
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', message]);
  return git(root, ['rev-parse', 'HEAD']);
}
