import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Draft, Source } from '../src/contract.js';
import { Git } from '../src/git.js';
import { freeze } from '../src/snapshot.js';
import { commit, repositoryFixture } from './git-fixture.js';

export const currentText = 'one\nchanged\nthree\n';
export async function packageFixture(): Promise<{ git: Git; source: Omit<Source, 'mergeBaseSha'>; draft: Draft }> {
  const { root, base } = await repositoryFixture();
  await writeFile(join(root, 'src/main.ts'), currentText);
  const head = commit(root, 'Change handler');
  const reader = await Git.open(root);
  const source = { repository: 'bajor/example', pr: 1, title: 'Handler', branch: 'feature', baseSha: base, headSha: head };
  const snapshot = await freeze(reader, source);
  return { git: reader, source, draft: {
    historyNote: 'The selected ancestor shows the existing mechanism before this PR.',
    references: [{ id: 'current', commit: head, path: 'src/main.ts', startLine: 2, endLine: 2 },
      { id: 'older', commit: base, path: 'src/main.ts', startLine: 1, endLine: 1 }],
    assignments: snapshot.changes.map((change) => ({ change: change.id, thread: 'handler' })),
    threads: [{ id: 'handler', title: 'Handler', summary: 'Handler evolution.',
      current: [{ text: 'The current handler extends the previous behavior.', evidence: 'fact', refs: ['current'] }],
      stages: [{ commit: base, title: 'Existing handler', blocks: [{ text: 'The original mechanism.', evidence: 'fact', refs: ['older'] }] },
        { commit: head, title: 'Change handler', blocks: [{ text: 'Extend that mechanism.', evidence: 'fact', refs: ['current'] }] }],
      diagrams: [{ id: 'flow', title: 'Handler flow', commit: head,
        nodes: [{ id: 'handler', label: 'Handler', refs: ['current'] }], edges: [] }],
    }],
  } };
}
