import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { repository } from './contract.js';
import { Git } from './git.js';
import { GitHub } from './github.js';
import { acquireGenerationLock } from './lock.js';
import { buildArtifact } from './package.js';
import { currentGeneration, publishArtifact } from './publication.js';
import { freeze, type Snapshot } from './snapshot.js';

export const intentSchema = z.discriminatedUnion('mode', [z.strictObject({ mode: z.literal('create') }),
  z.strictObject({ mode: z.literal('regenerate'), expectedGeneration: z.uuid() })]);
export interface RuntimeOptions { repositories: Record<string, string>; stateDirectory: string; profilePath: string }
interface Published { generation: string; commit: string; url: string; warning?: string }
interface Session {
  git: Git; snapshot: Snapshot; profile: Buffer; previous: string | null; release: () => Promise<void>;
  state: { kind: 'active' } | { kind: 'finishing'; done: Promise<Published> };
}
const MAX_PROFILE_BYTES = 64 * 1024;
const within = (root: string, path: string): boolean => {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
};
async function canonicalDirectory(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    return join(await canonicalDirectory(dirname(path)), basename(path));
  }
}

export class Runtime {
  private readonly sessions = new Map<string, Session>();
  private readonly starting = new Set<Promise<unknown>>();
  private closing: Promise<void> | undefined;
  private constructor(private readonly options: RuntimeOptions, private readonly github: GitHub) {}

  static async open(input: RuntimeOptions, github = new GitHub()): Promise<Runtime> {
    const mappings = z.record(repository, z.string().min(1)).parse(input.repositories);
    const entries = await Promise.all(Object.entries(mappings).map(async ([name, path]) => [name.toLowerCase(), await realpath(path)] as const));
    if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error('Duplicate repository mapping');
    const options = { repositories: Object.fromEntries(entries), stateDirectory: await canonicalDirectory(resolve(input.stateDirectory)),
      profilePath: await realpath(input.profilePath) };
    if (entries.some(([, root]) => within(root, options.stateDirectory) || within(root, options.profilePath))) {
      throw new Error('Private profile and lock state must be outside every source root');
    }
    return new Runtime(options, github);
  }

  private root(name: string): string {
    if (this.closing) throw new Error('Runtime is closing');
    repository.parse(name);
    const root = Object.hasOwn(this.options.repositories, name.toLowerCase()) ? this.options.repositories[name.toLowerCase()] : undefined;
    if (!root) throw new Error('Repository is not explicitly configured');
    return root;
  }

  async inspect(name: string, pr: number) {
    const root = this.root(name);
    const source = await this.github.discover(name, pr);
    const git = await Git.open(root);
    const snapshot = await freeze(git, source);
    return { git, snapshot, previous: await currentGeneration(git, snapshot.source) };
  }

  async begin(name: string, pr: number, intent: z.infer<typeof intentSchema>, signal?: AbortSignal) {
    this.root(name); intentSchema.parse(intent);
    const pending = this.start(name, pr, intent, signal);
    this.starting.add(pending);
    try { return await pending; } finally { this.starting.delete(pending); }
  }

  private async start(name: string, pr: number, intent: z.infer<typeof intentSchema>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const lock = await acquireGenerationLock(this.options.stateDirectory, name, pr);
    try {
      const inspection = await this.inspect(name, pr);
      const expected = intent.mode === 'create' ? null : intent.expectedGeneration;
      if (inspection.previous !== expected) throw new Error(`Generation intent does not match current UUID ${inspection.previous ?? 'none'}; inspect and explicitly choose regeneration`);
      const info = await stat(this.options.profilePath);
      if (!info.isFile() || info.size > MAX_PROFILE_BYTES || (info.mode & 0o077) || info.uid !== process.getuid?.()) throw new Error('Reader profile must be private, user-owned and at most 64 KiB');
      const profile = await readFile(this.options.profilePath);
      const profileText = new TextDecoder('utf-8', { fatal: true }).decode(profile);
      signal?.throwIfAborted();
      if (this.closing) throw new Error('Runtime is closing');
      this.sessions.set(lock.session, { ...inspection, profile, release: lock.release, state: { kind: 'active' } });
      return { session: lock.session, snapshot: structuredClone(inspection.snapshot), profile: profileText };
    } catch (error) { await lock.release(); throw error; }
  }

  session(id: string): Session {
    if (this.closing) throw new Error('Runtime is closing');
    const session = this.sessions.get(id);
    if (!session) throw new Error('Unknown or completed generation session');
    return session;
  }

  async evidence(id: string, revision: string): Promise<Session> {
    const session = this.session(id);
    if (revision !== session.snapshot.source.baseSha && !await session.git.isAncestor(revision, session.snapshot.source.headSha)) {
      throw new Error('Evidence revision is outside the frozen PR ancestry');
    }
    return session;
  }

  finish(id: string, draft: unknown): Promise<Published> {
    const session = this.session(id);
    if (session.state.kind !== 'active') throw new Error('Generation is already finishing');
    const done = this.complete(id, session, draft);
    session.state = { kind: 'finishing', done };
    return done;
  }

  private async complete(id: string, session: Session, draft: unknown): Promise<Published> {
    try {
      const pkg = await buildArtifact(session.git, session.snapshot.source, draft, session.profile);
      const commit = await publishArtifact(session.git, this.github, pkg, session.previous);
      this.sessions.delete(id);
      const result: Published = { generation: pkg.manifest.generation, commit,
        url: `https://github.com/${pkg.manifest.source.repository}/commit/${commit}` };
      try { await session.release(); } catch { result.warning = 'Published successfully, but lock cleanup failed. Inspect private lock state before another generation.'; }
      return result;
    } catch (error) { session.state = { kind: 'active' }; throw error; }
  }

  async cancel(id: string): Promise<void> {
    const session = this.session(id);
    if (session.state.kind !== 'active') throw new Error('Cannot cancel a finishing generation');
    this.sessions.delete(id);
    await session.release();
  }

  close(): Promise<void> { this.closing ??= this.shutdown(); return this.closing; }

  private async shutdown(): Promise<void> {
    await Promise.allSettled([...this.starting]);
    await Promise.allSettled([...this.sessions.values()].flatMap((session) => session.state.kind === 'finishing' ? [session.state.done] : []));
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    const results = await Promise.allSettled(sessions.map((session) => session.release()));
    if (results.some((result) => result.status === 'rejected')) throw new Error('Lock cleanup failed; inspect private lock state');
  }
}
