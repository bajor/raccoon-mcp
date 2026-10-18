import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { relativePath, sha } from './contract.js';

const execute = promisify(execFile);
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const decoder = new TextDecoder('utf-8', { fatal: true });
const safeOptions = ['--no-pager', '--no-replace-objects', '--literal-pathspecs',
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
  '-c', 'core.attributesFile=/dev/null', '-c', 'log.showSignature=false',
  '-c', 'diff.external=', '-c', 'protocol.ext.allow=never'];
const environment = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_ATTR_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_GRAFT_FILE: '/dev/null', GIT_ALLOW_PROTOCOL: '' };

async function command(root: string, options: string[], args: string[]): Promise<Buffer> {
  const result = await execute('git', [...safeOptions, ...options, ...args], {
    cwd: root, env: environment, encoding: 'buffer', maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MS,
  });
  return result.stdout;
}

export interface GitCommit { sha: string; parents: string[]; subject: string }
export interface GitFile { blob: string; data: Buffer; text: string; lines: number }
export interface GitChange { path: string; status: 'added' | 'modified' | 'deleted' | 'type-changed' }
export interface GitEntry { mode: string; kind: string; object: string; path: string }
export const sourceLineCount = (text: string): number => text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;

export class Git {
  private constructor(readonly root: string, private readonly options: string[]) {}

  static async open(path: string): Promise<Git> {
    const root = await realpath(path);
    const top = decoder.decode(await command(root, [], ['rev-parse', '--show-toplevel'])).trim();
    if (await realpath(top) !== root) throw new Error('Select the repository root, not a nested directory');
    let keys = '';
    try { keys = decoder.decode(await command(root, [], ['config', '--name-only', '--get-regexp',
      '^filter\\.|^remote\\..*\\.(promisor|partialclonefilter)$|^extensions\\.partialclone$'])); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 1)) throw error; }
    if (keys.split('\n').some((key) => !key.startsWith('filter.') && key !== '')) {
      throw new Error('Partial Git clones require a complete local clone before inspection');
    }
    // Local .gitattributes can name any configured filter. Disable every driver,
    // including process filters, before status or future index operations.
    const drivers = new Set(keys.trim().split('\n').filter(Boolean).map((key) => key.slice(0, key.lastIndexOf('.'))));
    const options = [...drivers].flatMap((driver) => ['clean', 'smudge', 'process', 'required']
      .flatMap((kind) => ['-c', `${driver}.${kind}=${kind === 'required' ? 'false' : ''}`]));
    return new Git(root, options);
  }

  async bytes(args: string[]): Promise<Buffer> { return command(this.root, this.options, args); }
  async text(args: string[]): Promise<string> { return decoder.decode(await this.bytes(args)); }

  async verifyCommit(revision: string): Promise<string> {
    sha.parse(revision);
    return sha.parse((await this.text(['rev-parse', '--verify', `${revision}^{commit}`])).trim());
  }

  async commit(revision: string): Promise<GitCommit> {
    await this.verifyCommit(revision);
    const [hash, parents, subject] = (await this.text(['show', '--no-patch', '--format=%H%x00%P%x00%s', revision])).replace(/\n$/, '').split('\0');
    if (hash !== revision || parents === undefined || subject === undefined) throw new Error('Unrepresentable Git commit metadata');
    return { sha: hash, parents: parents ? parents.split(' ').map((parent) => sha.parse(parent)) : [], subject };
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    sha.parse(ancestor); sha.parse(descendant);
    try { await this.bytes(['merge-base', '--is-ancestor', ancestor, descendant]); return true; }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 1) return false; throw error; }
  }

  async file(revision: string, path: string): Promise<GitFile> {
    sha.parse(revision); relativePath.parse(path);
    const entry = decoder.decode(await this.bytes(['ls-tree', '-z', revision, '--', path]));
    const separator = entry.indexOf('\t');
    const [mode, kind, blob] = entry.slice(0, separator).split(' ');
    if (!['100644', '100755'].includes(mode ?? '') || kind !== 'blob' || !blob || entry.slice(separator + 1) !== `${path}\0`) {
      throw new Error(`Reference is not a regular Git file: ${revision}:${path}`);
    }
    const data = await this.bytes(['cat-file', 'blob', sha.parse(blob)]);
    const text = decoder.decode(data);
    if (text.includes('\0')) throw new Error(`Binary file cannot be a text reference: ${path}`);
    return { blob, data, text, lines: sourceLineCount(text) };
  }

  async changes(revision: string): Promise<GitChange[]> {
    const commit = await this.commit(revision);
    const comparison = commit.parents[0] ? [commit.parents[0], revision] : ['--root', revision];
    const records = (await this.text(['diff-tree', '--no-commit-id', '-r', '--name-status', '--no-renames', '-z', ...comparison])).split('\0');
    records.pop();
    const status = { A: 'added', M: 'modified', D: 'deleted', T: 'type-changed' } as const;
    const result: GitChange[] = [];
    for (let index = 0; index < records.length; index += 2) {
      const change = status[records[index] as keyof typeof status];
      if (!change || records[index + 1] === undefined) throw new Error('Unsupported Git change record');
      result.push({ status: change, path: relativePath.parse(records[index + 1]) });
    }
    return result;
  }

  async entries(revision: string, path?: string): Promise<GitEntry[]> {
    sha.parse(revision);
    if (path !== undefined) relativePath.parse(path);
    const records = (await this.text(['ls-tree', '-r', '-z', '--full-tree', revision, '--', ...(path ? [path] : [])])).split('\0').filter(Boolean);
    return records.map((record) => {
      const tab = record.indexOf('\t');
      const [mode, kind, object] = record.slice(0, tab).split(' ');
      if (tab < 0 || !mode || !kind || !object) throw new Error('Invalid Git tree entry');
      return { mode, kind, object: sha.parse(object), path: relativePath.parse(record.slice(tab + 1)) };
    });
  }

  async diff(revision: string, paths: string[] = []): Promise<string> {
    const commit = await this.commit(revision);
    paths.forEach((path) => relativePath.parse(path));
    const comparison = commit.parents[0] ? [commit.parents[0], revision] : ['--root', revision];
    return this.text(['diff-tree', '-p', '--no-commit-id', '--no-ext-diff', '--no-textconv', '--no-renames', ...comparison, '--', ...paths]);
  }

  async history(revision: string, skip = 0, count = 50, path?: string): Promise<GitCommit[]> {
    sha.parse(revision);
    if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(skip + count) || !Number.isSafeInteger(count) || count < 1 || count > 200) throw new Error('Invalid history page');
    if (path !== undefined) relativePath.parse(path);
    // --skip prevents --follow from seeing skipped renames. Traverse the prefix
    // before selecting the page, or older names disappear from later pages.
    const paging = path ? ['--follow', `--max-count=${skip + count}`] : [`--skip=${skip}`, `--max-count=${count}`];
    const hashes = (await this.text(['log', '--format=%H', ...paging, revision, '--', ...(path ? [path] : [])]))
      .trim().split('\n').filter(Boolean).slice(path ? skip : 0);
    return Promise.all(hashes.map((hash) => this.commit(hash)));
  }
}
