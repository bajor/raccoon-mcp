import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import type { Source } from '../src/contract.js';
import { GitHub, type FileChanges } from '../src/github.js';
import { buildArtifact, type Package } from '../src/package.js';
import { commit } from './git-fixture.js';
import { packageFixture } from './package-fixture.js';

export class GitHubDouble {
  mutations: { query: string; variables: { input: { expectedHeadOid: string; fileChanges: FileChanges } } }[] = [];
  readonly github: GitHub;
  constructor(readonly source: Omit<Source, 'mergeBaseSha'>) {
    this.github = new GitHub(async (endpoint, input) => {
      if (endpoint === `repos/${source.repository}/pulls/${source.pr}`) return {
        number: source.pr, state: 'open', title: source.title, base: { sha: source.baseSha, repo: { full_name: source.repository } },
        head: { sha: source.headSha, ref: source.branch, repo: { full_name: source.repository } },
      };
      if (endpoint !== 'graphql') throw new Error(`Unexpected request ${endpoint}`);
      this.mutations.push(input as (typeof this.mutations)[number]);
      return { data: { createCommitOnBranch: { commit: { oid: 'e'.repeat(40) } } } };
    });
  }
  get changes(): FileChanges { return this.mutations[0]!.variables.input.fileChanges; }
}

export async function publicationFixture(context: TestContext) {
  const fixture = await packageFixture();
  context.after(() => rm(fixture.git.root, { recursive: true, force: true }));
  return { ...fixture, pkg: await buildArtifact(fixture.git, fixture.source, fixture.draft, Buffer.from('private')) };
}

export async function advance(fixture: Awaited<ReturnType<typeof publicationFixture>>): Promise<Package> {
  fixture.source.headSha = commit(fixture.git.root, 'Artifact-only change');
  const draft = structuredClone(fixture.draft);
  draft.references.push({ ...draft.references[0]!, id: 'final', commit: fixture.source.headSha });
  draft.threads[0]!.current[0]!.refs = ['final'];
  draft.threads[0]!.diagrams[0]!.commit = fixture.source.headSha;
  draft.threads[0]!.diagrams[0]!.nodes[0]!.refs = ['final'];
  return buildArtifact(fixture.git, fixture.source, draft, Buffer.from('private'));
}

export async function previousFixture(context: TestContext) {
  const fixture = await publicationFixture(context);
  const oldDraft = structuredClone(fixture.draft);
  oldDraft.threads[0]!.diagrams[0]!.id = 'obsolete';
  const previous = await buildArtifact(fixture.git, fixture.source, oldDraft, Buffer.from('private'));
  for (const [path, bytes] of previous.assets) {
    const destination = join(fixture.git.root, 'raccoon-artifacts/pr-1', path);
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
  }
  await writeFile(join(fixture.git.root, 'raccoon-artifacts/catalog.json'), JSON.stringify({ version: 1,
    repository: fixture.source.repository, artifacts: [{ pr: 1, manifest: 'pr-1/manifest.json' }, { pr: 2, manifest: 'pr-2/manifest.json' }] }));
  await writeFile(join(fixture.git.root, 'raccoon-artifacts/pr-1/notes.md'), 'Keep my notes.');
  return { ...fixture, pkg: await advance(fixture), previous };
}
