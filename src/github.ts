import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { z } from 'zod';
import { repository, sha, type Source } from './contract.js';

export type GitHubRequest = (endpoint: string, input?: unknown) => Promise<unknown>;
export interface FileChanges { additions: { path: string; contents: string }[]; deletions: { path: string }[] }

const request: GitHubRequest = (endpoint, input) => new Promise((resolve, reject) => {
  const args = ['api', '--hostname', 'github.com', endpoint, ...(input === undefined ? [] : ['--input', '-'])];
  const child = execFile('gh', args, { cwd: homedir(), timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
    if (error) return reject(new Error('GitHub request failed. If publishing, inspect the remote generation before retrying; the outcome may be uncertain.'));
    try { resolve(JSON.parse(stdout)); } catch { reject(new Error('GitHub returned an invalid response; inspect the remote branch before retrying publication.')); }
  });
  child.stdin?.on('error', () => {});
  child.stdin?.end(input === undefined ? undefined : JSON.stringify(input));
});

const repo = z.object({ full_name: repository });
const pull = z.object({ number: z.number().int().positive(), state: z.enum(['open', 'closed']), title: z.string().trim().min(1),
  base: z.object({ sha, repo }), head: z.object({ sha, ref: z.string().min(1), repo: repo.nullable() }) });
const mutation = `mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

export class GitHub {
  constructor(private readonly api: GitHubRequest = request) {}

  async discover(name: string, pr: number): Promise<Omit<Source, 'mergeBaseSha'>> {
    repository.parse(name); z.number().int().positive().safe().parse(pr);
    const data = pull.parse(await this.api(`repos/${name}/pulls/${pr}`));
    if (data.number !== pr || data.base.repo.full_name.toLowerCase() !== name.toLowerCase()) throw new Error('GitHub PR identity changed');
    if (data.state !== 'open') throw new Error('The PR must be open');
    if (data.head.repo?.full_name.toLowerCase() !== name.toLowerCase()) throw new Error('Fork PR publication requires a separately authorized destination');
    return { repository: data.base.repo.full_name, pr, title: data.title, branch: data.head.ref,
      baseSha: data.base.sha, headSha: data.head.sha };
  }

  async publish(source: Source, changes: FileChanges): Promise<string> {
    const current = await this.discover(source.repository, source.pr);
    if (current.baseSha !== source.baseSha || current.headSha !== source.headSha || current.branch !== source.branch) {
      throw new Error('PR source changed; freeze and rebuild the complete generation');
    }
    const response = await this.api('graphql', { query: mutation, variables: { input: {
      branch: { repositoryNameWithOwner: source.repository, branchName: source.branch },
      expectedHeadOid: source.headSha, fileChanges: changes,
      message: { headline: `Publish Raccoon explanation for PR #${source.pr}`,
        body: `Complete Git-backed generation pinned to ${source.headSha}. Source files are unchanged.` },
    } } });
    return z.object({ data: z.object({ createCommitOnBranch: z.object({ commit: z.object({ oid: sha }) }) }) })
      .parse(response).data.createCommitOnBranch.commit.oid;
  }
}
