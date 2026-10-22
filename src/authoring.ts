import type { z } from 'zod';
import { codeReferences, draftSchema, type Draft } from './contract.js';

export const AUTHORING_LIMITS = {
  introduction: 60, historyNote: 80, summary: 30, caption: 60, section: 120,
  excerpt: 80, nodes: 8, edges: 12,
} as const;
type Path = (string | number)[];
const words = (text: string): number => text.trim().split(/\s+/u).length;
const rangeKey = (ref: Draft['references'][number]): string =>
  JSON.stringify([ref.commit, ref.path, ref.startLine, ref.endLine]);
const problem = (context: z.RefinementCtx, path: Path, message: string): void =>
  context.addIssue({ code: 'custom', path, message });
function limit(text: string, maximum: number, context: z.RefinementCtx, path: Path): void {
  if (words(text) > maximum) problem(context, path, `Use at most ${maximum} words`);
}

function sectionPolicy(section: Draft['chapters'][number]['sections'][number], path: Path,
  keys: Map<string, string>, context: z.RefinementCtx): void {
  if (section.blocks[0]?.kind === 'prose') problem(context, path, 'Open with code or a diagram, not prose');
  const captions = section.blocks.filter((block) => block.kind === 'prose');
  const visuals = new Set(section.blocks.flatMap((block) => block.kind === 'prose' ? [] :
    [block.kind === 'diagram' ? `diagram:${block.diagram}` : `code:${codeReferences(block).map((ref) => keys.get(ref)).join(':')}`]));
  if (!section.blocks.some((block) => codeReferences(block).length)) problem(context, path, 'Every section needs inline code');
  if (captions.length > visuals.size) problem(context, path, 'Prose blocks cannot outnumber distinct visual placements');
  for (const [index, block] of section.blocks.entries()) {
    if (block.kind === 'prose') limit(block.text, AUTHORING_LIMITS.caption, context, [...path, 'blocks', index, 'text']);
  }
  if (captions.reduce((sum, block) => sum + words(block.text), 0) > AUTHORING_LIMITS.section) {
    problem(context, path, `Section captions must total at most ${AUTHORING_LIMITS.section} words`);
  }
}

// Generation policy is stricter than the portable reader format, which stays v2.
export const authoringDraftSchema = draftSchema.superRefine((draft, context) => {
  limit(draft.introduction, AUTHORING_LIMITS.introduction, context, ['introduction']);
  limit(draft.historyNote, AUTHORING_LIMITS.historyNote, context, ['historyNote']);
  const refs = new Map(draft.references.map((ref) => [ref.id, ref]));
  const keys = new Map(draft.references.map((ref) => [ref.id, rangeKey(ref)]));
  for (const [index, ref] of draft.references.entries()) {
    if (ref.endLine - ref.startLine + 1 > AUTHORING_LIMITS.excerpt) {
      problem(context, ['references', index], `Inline code must fit within ${AUTHORING_LIMITS.excerpt} lines`);
    }
  }
  for (const [index, chapter] of draft.chapters.entries()) {
    const path: Path = ['chapters', index];
    limit(chapter.summary, AUTHORING_LIMITS.summary, context, [...path, 'summary']);
    const head = chapter.sections[0];
    if (!head) continue;
    if (head.blocks[0]?.kind !== 'diagram') problem(context, path, 'Open the chapter with a diagram');
    const code = new Set(head.blocks.flatMap((block) => codeReferences(block)
      .filter((ref) => refs.get(ref)?.commit === head.commit).map((ref) => keys.get(ref))));
    if (code.size < 2) problem(context, path, 'Show two distinct current code ranges: mechanism and surrounding context');
    chapter.sections.forEach((section, i) => sectionPolicy(section, [...path, 'sections', i], keys, context));
    for (const [i, diagram] of chapter.diagrams.entries()) {
      if (diagram.nodes.length > AUTHORING_LIMITS.nodes || diagram.edges.length > AUTHORING_LIMITS.edges) {
        problem(context, [...path, 'diagrams', i], `Split graphs exceeding ${AUTHORING_LIMITS.nodes} nodes or ${AUTHORING_LIMITS.edges} edges`);
      }
    }
  }
});
