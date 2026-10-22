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
    language: 'en', title: 'Understanding the handler', introduction: 'A request and its evolution.',
    historyNote: 'The selected ancestor shows the existing mechanism before this PR.',
    references: [{ id: 'current', commit: head, path: 'src/main.ts', startLine: 2, endLine: 2 },
      { id: 'older', commit: base, path: 'src/main.ts', startLine: 1, endLine: 1 },
      { id: 'context', commit: head, path: 'src/main.ts', startLine: 1, endLine: 1 }],
    assignments: snapshot.changes.map((change) => ({ change: change.id, chapter: 'handler' })),
    chapters: [{ id: 'handler', title: 'Handler', summary: 'Handler evolution.',
       sections: [{ commit: head, title: 'How the handler works', blocks: [
         { kind: 'diagram', diagram: 'flow' },
         { kind: 'prose', text: 'The current handler extends the previous behavior.', evidence: 'fact', refs: ['current'] },
         { kind: 'code', reference: 'current' }, { kind: 'code', reference: 'context' },
       ] }, { commit: base, title: 'The original mechanism', blocks: [
         { kind: 'code', reference: 'older' }, { kind: 'prose', text: 'The original mechanism.', evidence: 'fact', refs: ['older'] },
      ] }],
      diagrams: [{ id: 'flow', title: 'Handler flow', commit: head,
        nodes: [{ id: 'handler', label: 'Handler', refs: ['current'] }], edges: [] }],
    }],
  } };
}
