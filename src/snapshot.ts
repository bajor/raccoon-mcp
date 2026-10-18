import { createHash } from 'node:crypto';
import { ARTIFACT_ROOT, sourceSchema, type Artifact, type Change, type Commit, type Source } from './contract.js';
import { Git } from './git.js';

export interface Snapshot {
  source: Source;
  commits: Commit[];
  changes: Change[];
  excludedCommits: Artifact['excludedCommits'];
}
export const isGeneratedPath = (path: string): boolean => path === ARTIFACT_ROOT || path.startsWith(`${ARTIFACT_ROOT}/`) ||
  (path.startsWith('visual-explanations/') && path.endsWith('.svg'));

export async function freeze(git: Git, input: Omit<Source, 'mergeBaseSha'>): Promise<Snapshot> {
  if ((await git.text(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Error('Complete Git history is required. Fetch the full history before generating.');
  }
  await git.verifyCommit(input.baseSha); await git.verifyCommit(input.headSha);
  const mergeBaseSha = (await git.text(['merge-base', input.baseSha, input.headSha])).trim();
  const source = sourceSchema.parse({ ...input, mergeBaseSha });
  const hashes = (await git.text(['rev-list', '--reverse', '--topo-order', `${source.baseSha}..${source.headSha}`])).trim().split('\n').filter(Boolean);
  const snapshot: Snapshot = { source, commits: [], changes: [], excludedCommits: [] };
  for (const hash of hashes) {
    const changed = await git.changes(hash);
    const sourceChanges = changed.filter((change) => !isGeneratedPath(change.path));
    if (!sourceChanges.length) {
      snapshot.excludedCommits.push({ sha: hash, reason: changed.length ? 'generated-only' : 'no-source-change' });
      continue;
    }
    snapshot.commits.push({ ...await git.commit(hash), phase: 'pr' });
    snapshot.changes.push(...sourceChanges.map((change) => ({ ...change, commit: hash,
      id: createHash('sha256').update(`${hash}\0${change.path}`).digest('hex') })));
  }
  if (!snapshot.changes.length) throw new Error('PR has no source changes to explain');
  return snapshot;
}
