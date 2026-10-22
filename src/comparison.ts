import type { Draft } from './contract.js';
import type { Git } from './git.js';

// Diff endpoints are complete Git files, never independently sliced snippets.
export async function checkComparisons(git: Git, draft: Draft): Promise<void> {
  const refs = new Map(draft.references.map((ref) => [ref.id, ref]));
  for (const chapter of draft.chapters) for (const section of chapter.sections) {
    for (const block of section.blocks) {
      if (block.kind !== 'diff') continue;
      const before = block.before === null ? undefined : refs.get(block.before)!;
      const after = block.after === null ? undefined : refs.get(block.after)!;
      if (before && (before.commit === section.commit || !await git.isAncestor(before.commit, section.commit))) {
        throw new Error('Diff baseline must be an earlier ancestor of its section');
      }
      if (before && after && before.path !== after.path) {
        throw new Error('Compare the same Git path; explain renames as deletion and addition');
      }
      if (!before) {
        const parent = (await git.commit(section.commit)).parents[0];
        if (parent && (await git.entries(parent, after!.path)).some((entry) => entry.path === after!.path)) {
          throw new Error('Added diff file exists in the first parent');
        }
      }
      if (!after) {
        const parent = (await git.commit(section.commit)).parents[0];
        if (before!.commit !== parent || (await git.entries(section.commit, before!.path)).some((entry) => entry.path === before!.path)) {
          throw new Error('Deleted diff needs the first-parent file and its absence at the section revision');
        }
      }
    }
  }
}
