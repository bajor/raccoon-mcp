import { createHash, randomUUID } from 'node:crypto';
import { artifactSchema, draftSchema, CONTRACT_VERSION, type Artifact, type Commit, type Draft, type Source } from './contract.js';
import { renderDiagram } from './diagram.js';
import { Git } from './git.js';
import { freeze, type Snapshot } from './snapshot.js';

export const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const checksum = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export interface Package { manifest: Artifact; assets: Map<string, Buffer> }

async function timeline(git: Git, snapshot: Snapshot, draft: Draft): Promise<Commit[]> {
  const stages = new Set(draft.threads.flatMap((thread) => thread.stages.map((stage) => stage.commit)));
  const selected = new Set([...stages, ...draft.references.map((reference) => reference.commit),
    ...draft.threads.flatMap((thread) => thread.diagrams.map((diagram) => diagram.commit))]);
  const known = new Set([...snapshot.commits.map((commit) => commit.sha), ...snapshot.excludedCommits.map((commit) => commit.sha)]);
  const result = new Map(snapshot.commits.map((commit) => [commit.sha, commit]));
  for (const hash of selected) {
    if (known.has(hash)) continue;
    if (hash === snapshot.source.baseSha && !stages.has(hash)) continue;
    if (!await git.isAncestor(hash, snapshot.source.baseSha) || !await git.isAncestor(hash, snapshot.source.headSha)) {
      throw new Error(`Historical revision is not a shared ancestor of the pinned PR: ${hash}`);
    }
    result.set(hash, { ...await git.commit(hash), phase: 'before-pr' });
  }
  const order = (await git.text(['rev-list', '--reverse', '--topo-order', snapshot.source.baseSha, snapshot.source.headSha]))
    .trim().split('\n').filter(Boolean);
  return order.flatMap((hash) => result.has(hash) ? [result.get(hash)!] : []);
}

async function checkRevisions(git: Git, snapshot: Snapshot, draft: Draft): Promise<void> {
  const refs = new Map(draft.references.map((reference) => [reference.id, reference]));
  const ancestors = new Map<string, boolean>();
  async function prior(ids: string[], revision: string): Promise<void> {
    for (const id of ids) {
      const ref = refs.get(id)!;
      const key = `${ref.commit}:${revision}`;
      if (!ancestors.has(key)) ancestors.set(key, await git.isAncestor(ref.commit, revision));
      if (!ancestors.get(key)) throw new Error(`Reference ${id} did not exist at diagram/stage ${revision}`);
    }
  }
  for (const thread of draft.threads) {
    if (!thread.current.some((block) => block.refs.some((id) => refs.get(id)!.commit === snapshot.source.headSha))) {
      throw new Error(`Thread ${thread.id} needs final-state source at the pinned head`);
    }
    if (!thread.diagrams.some((diagram) => diagram.commit === snapshot.source.headSha)) {
      throw new Error(`Thread ${thread.id} needs a diagram at the pinned head`);
    }
    for (const stage of thread.stages) await prior(stage.blocks.flatMap((block) => block.refs), stage.commit);
    for (const diagram of thread.diagrams) await prior(diagram.nodes.flatMap((node) => node.refs), diagram.commit);
  }
}

export async function buildArtifact(git: Git, source: Omit<Source, 'mergeBaseSha'>, input: unknown,
  privateProfile: Uint8Array): Promise<Package> {
  const snapshot = await freeze(git, source);
  const content = draftSchema.parse(input);
  const commits = await timeline(git, snapshot, content);
  await checkRevisions(git, snapshot, content);
  const assets = new Map<string, Buffer>();
  let total = 0;
  function put(path: string, bytes: Buffer): void {
    if (assets.has(path)) return;
    total += bytes.length;
    if (total > MAX_PACKAGE_BYTES) throw new Error('Artifact exceeds the 200 MiB reader import limit');
    assets.set(path, bytes);
  }
  const files: Artifact['files'] = [];
  for (const reference of content.references) {
    const file = await git.file(reference.commit, reference.path);
    if (reference.endLine > file.lines) throw new Error(`Reference ${reference.id} exceeds the real file's ${file.lines} lines`);
    const sha256 = checksum(file.data);
    const path = `files/${sha256}.txt`;
    put(path, file.data);
    files.push({ reference: reference.id, blob: file.blob, sha256, file: path, bytes: file.data.length, lines: file.lines });
  }
  const diagrams: Artifact['diagrams'] = [];
  for (const thread of content.threads) for (const diagram of thread.diagrams) {
    const data = renderDiagram(diagram);
    const path = `diagrams/${thread.id}/${diagram.id}.svg`;
    put(path, data);
    diagrams.push({ thread: thread.id, diagram: diagram.id, file: path, sha256: checksum(data) });
  }
  const manifest = artifactSchema.parse({ version: CONTRACT_VERSION, generation: randomUUID(), createdAt: new Date().toISOString(),
    ...snapshot, commits, profileHash: checksum(privateProfile), content, files, diagrams });
  put('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));
  return { manifest, assets };
}
