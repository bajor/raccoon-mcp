import type { Artifact, Draft } from '../src/contract.js';

export const commit = 'a'.repeat(40);
export const hash = 'b'.repeat(64);
export const base = '0'.repeat(40);

export function draft(): Draft {
  return {
    language: 'en', title: 'Understanding the handler', introduction: 'Follow a request through the handler.',
    historyNote: 'History includes the PR and relevant available ancestors.',
    references: [{ id: 'r1', commit, path: 'src/main.ts', startLine: 1, endLine: 2 }],
    assignments: [{ change: 'c1', chapter: 'flow' }],
    chapters: [{
      id: 'flow', title: 'Request flow', summary: 'Connect the handler to its caller.',
      sections: [{ commit, title: 'How the handler works', blocks: [
        { kind: 'prose', text: 'The handler accepts a request.', evidence: 'fact', refs: ['r1'] },
        { kind: 'code', reference: 'r1' }, { kind: 'diagram', diagram: 'request' },
      ] }],
      diagrams: [{ id: 'request', title: 'Request path', commit,
        nodes: [{ id: 'handler', label: 'Handler', refs: ['r1'] }], edges: [] }],
    }],
  };
}

export function artifact(): Artifact {
  return {
    version: 2, generation: '71defc62-8b6b-4f81-80ce-c7ed4b639df7',
    createdAt: '2026-10-18T00:00:00Z', profileHash: hash,
    source: { repository: 'bajor/example', pr: 1, title: 'Handler', branch: 'feature',
      baseSha: base, mergeBaseSha: base, headSha: commit },
    commits: [{ sha: commit, subject: 'Add handler', parents: [base], phase: 'pr' }],
    changes: [{ id: 'c1', commit, path: 'src/main.ts', status: 'added' }],
    excludedCommits: [],
    content: draft(),
    files: [{ reference: 'r1', blob: commit, sha256: hash, file: `files/${hash}.txt`, bytes: 8, lines: 2 }],
    diagrams: (['landscape', 'portrait'] as const).map((layout) => ({ chapter: 'flow', diagram: 'request', layout,
      file: `diagrams/flow/request-${layout}.svg`, sha256: hash, width: 200, height: 100 })),
  };
}
