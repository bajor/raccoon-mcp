import type { Artifact, Draft } from '../src/contract.js';

export const commit = 'a'.repeat(40);
export const hash = 'b'.repeat(64);
export const base = '0'.repeat(40);

export function draft(): Draft {
  return {
    historyNote: 'History includes the PR and relevant available ancestors.',
    references: [{ id: 'r1', commit, path: 'src/main.ts', startLine: 1, endLine: 2 }],
    assignments: [{ change: 'c1', thread: 'flow' }],
    threads: [{
      id: 'flow', title: 'Request flow', summary: 'Connect the handler to its caller.',
      current: [{ text: 'The handler accepts a request.', evidence: 'fact', refs: ['r1'] }],
      stages: [{ commit, title: 'Add handler', blocks: [{ text: 'Introduce the handler.', evidence: 'fact', refs: ['r1'] }] }],
      diagrams: [{ id: 'request', title: 'Request path', commit,
        nodes: [{ id: 'handler', label: 'Handler', refs: ['r1'] }], edges: [] }],
    }],
  };
}

export function artifact(): Artifact {
  return {
    version: 1, generation: '71defc62-8b6b-4f81-80ce-c7ed4b639df7',
    createdAt: '2026-10-18T00:00:00Z', profileHash: hash,
    source: { repository: 'bajor/example', pr: 1, title: 'Handler', branch: 'feature',
      baseSha: base, mergeBaseSha: base, headSha: commit },
    commits: [{ sha: commit, subject: 'Add handler', parents: [base], phase: 'pr' }],
    changes: [{ id: 'c1', commit, path: 'src/main.ts', status: 'added' }],
    excludedCommits: [],
    content: draft(),
    files: [{ reference: 'r1', blob: commit, sha256: hash, file: `files/${hash}.txt`, bytes: 8, lines: 2 }],
    diagrams: [{ thread: 'flow', diagram: 'request', file: 'diagrams/flow/request.svg', sha256: hash }],
  };
}
