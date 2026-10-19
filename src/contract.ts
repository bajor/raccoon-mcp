import { z } from 'zod';

export const ARTIFACT_ROOT = 'raccoon-artifacts';
export const CONTRACT_VERSION = 2;
// IDs become portable filenames, including on case-insensitive filesystems.
const id = z.string().max(64).regex(/^[a-z0-9][a-z0-9_-]*$/)
  .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value), 'Reserved filename');
export const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const repository = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-zA-Z0-9_.-]+$/)
  .refine((value) => !['.', '..'].includes(value.split('/')[1]!), 'Invalid repository name');
export const relativePath = z.string().min(1).refine((value) =>
  !value.startsWith('/') && !value.includes('\0') &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'Expected a repository-relative path without traversal');
const text = z.string().trim().min(1);

export const commitSchema = z.strictObject({
  sha, subject: z.string(), parents: z.array(sha), phase: z.enum(['pr', 'before-pr']),
});
export const changeSchema = z.strictObject({
  id, commit: sha, path: relativePath, status: z.enum(['added', 'modified', 'deleted', 'renamed', 'type-changed']),
});
export const referenceSchema = z.strictObject({
  id, commit: sha, path: relativePath,
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).refine((ref) => ref.endLine >= ref.startLine, 'Reversed line range');

export const proseSchema = z.strictObject({
  kind: z.literal('prose'), text,
  evidence: z.enum(['fact', 'inference', 'unknown']),
  refs: z.array(id).min(1),
});
export const blockSchema = z.discriminatedUnion('kind', [proseSchema,
  z.strictObject({ kind: z.literal('code'), reference: id }),
  z.strictObject({ kind: z.literal('diagram'), diagram: id }),
]);
const diagramSchema = z.strictObject({
  id, title: text, commit: sha,
  nodes: z.array(z.strictObject({ id, label: text.max(160), refs: z.array(id).min(1) })).min(1).max(24),
  edges: z.array(z.strictObject({ from: id, to: id, label: z.string().max(80) })).max(96),
});
const chapterSchema = z.strictObject({
  id, title: text.max(100), summary: text,
  sections: z.array(z.strictObject({ commit: sha, title: text, blocks: z.array(blockSchema).min(1) })).min(1),
  diagrams: z.array(diagramSchema).min(1),
});
const draftShape = z.strictObject({
  language: z.literal('en'), title: text, introduction: text,
  references: z.array(referenceSchema).min(1),
  chapters: z.array(chapterSchema).min(1),
  assignments: z.array(z.strictObject({ change: id, chapter: id })).min(1),
  historyNote: text,
});
export const draftSchema = draftShape.superRefine(checkDraft);
export const sourceSchema = z.strictObject({
  repository, pr: z.number().int().positive(), title: text,
  branch: text, baseSha: sha, mergeBaseSha: sha, headSha: sha,
});
const artifactShape = z.strictObject({
  version: z.literal(CONTRACT_VERSION), generation: z.uuid(), createdAt: z.iso.datetime(),
  source: sourceSchema, profileHash: digest, commits: z.array(commitSchema).min(1),
  changes: z.array(changeSchema).min(1),
  excludedCommits: z.array(z.strictObject({ sha, reason: z.enum(['generated-only', 'no-source-change']) })),
  content: draftSchema,
  files: z.array(z.strictObject({
    reference: id, blob: sha, sha256: digest, file: relativePath,
    bytes: z.number().int().nonnegative(), lines: z.number().int().nonnegative(),
  })).min(1),
  diagrams: z.array(z.strictObject({ chapter: id, diagram: id, layout: z.enum(['landscape', 'portrait']),
    file: relativePath, sha256: digest, width: z.number().positive(), height: z.number().positive() })).min(2),
});
export const artifactSchema = artifactShape.superRefine(checkArtifact);
export const catalogSchema = z.strictObject({
  version: z.literal(CONTRACT_VERSION), repository,
  artifacts: z.array(z.strictObject({ pr: z.number().int().positive(), manifest: relativePath })),
}).superRefine((catalog, context) => {
  const seen = new Set<number>();
  for (const [index, item] of catalog.artifacts.entries()) {
    if (seen.has(item.pr)) issue(context, ['artifacts', index, 'pr'], 'Duplicate PR');
    if (item.manifest !== `pr-${item.pr}/manifest.json`) {
      issue(context, ['artifacts', index, 'manifest'], 'Noncanonical manifest path');
    }
    seen.add(item.pr);
  }
});

export type Draft = z.infer<typeof draftSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Commit = z.infer<typeof commitSchema>;
export type Change = z.infer<typeof changeSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Block = z.infer<typeof blockSchema>;

type IssuePath = (string | number)[];
function issue(context: z.RefinementCtx, path: IssuePath, message: string): void {
  context.addIssue({ code: 'custom', path, message });
}

function unique(values: string[], context: z.RefinementCtx, path: IssuePath, name: string): void {
  if (new Set(values).size !== values.length) issue(context, path, `Duplicate ${name}`);
}

function checkDraft(draft: z.infer<typeof draftShape>, context: z.RefinementCtx): void {
  unique(draft.references.map((ref) => ref.id), context, ['references'], 'reference ID');
  unique(draft.chapters.map((chapter) => chapter.id), context, ['chapters'], 'chapter ID');
  unique(draft.assignments.map((assignment) => assignment.change), context, ['assignments'], 'change assignment');
  const refs = new Set(draft.references.map((ref) => ref.id));
  const cited = new Set<string>();
  const chapters = new Set(draft.chapters.map((chapter) => chapter.id));
  const checkRefs = (ids: string[], path: IssuePath) => {
    for (const ref of ids) {
      cited.add(ref);
      if (!refs.has(ref)) issue(context, path, `Unknown reference ${ref}`);
    }
  };
  for (const [index, assignment] of draft.assignments.entries()) {
    if (!chapters.has(assignment.chapter)) issue(context, ['assignments', index, 'chapter'], `Unknown chapter ${assignment.chapter}`);
  }
  for (const [index, chapter] of draft.chapters.entries()) {
    const path: IssuePath = ['chapters', index];
    unique(chapter.sections.slice(1).map((section) => section.commit), context, path, `historical section in ${chapter.id}`);
    unique(chapter.diagrams.map((diagram) => diagram.id), context, path, `diagram in ${chapter.id}`);
    const placed = new Set<string>();
    const blocks = chapter.sections.flatMap((section) => section.blocks);
    if (!blocks.some((block) => block.kind === 'code')) issue(context, path, 'Chapter needs inline code');
    for (const [i, section] of chapter.sections.entries()) {
      if (!section.blocks.some((block) => block.kind === 'prose')) issue(context, [...path, 'sections', i], 'Section needs prose');
      for (const [j, block] of section.blocks.entries()) {
        const blockPath = [...path, 'sections', i, 'blocks', j];
        if (block.kind === 'prose') checkRefs(block.refs, blockPath);
        if (block.kind === 'code') checkRefs([block.reference], blockPath);
        if (block.kind === 'diagram') {
          placed.add(block.diagram);
          if (!chapter.diagrams.some((diagram) => diagram.id === block.diagram)) issue(context, blockPath, `Unknown inline diagram ${block.diagram}`);
        }
      }
    }
    for (const [i, diagram] of chapter.diagrams.entries()) {
      const diagramPath = [...path, 'diagrams', i];
      if (!placed.has(diagram.id)) issue(context, diagramPath, `Unplaced diagram ${diagram.id}`);
      unique(diagram.nodes.map((node) => node.id), context, diagramPath, `node in ${diagram.id}`);
      const nodes = new Set(diagram.nodes.map((node) => node.id));
      diagram.nodes.forEach((node) => checkRefs(node.refs, diagramPath));
      for (const edge of diagram.edges) {
        if (!nodes.has(edge.from) || !nodes.has(edge.to)) issue(context, diagramPath, `Unknown diagram endpoint in ${diagram.id}`);
      }
    }
  }
  for (const ref of refs) if (!cited.has(ref)) issue(context, ['references'], `Uncited reference ${ref}`);
}

function checkArtifact(artifact: z.infer<typeof artifactShape>, context: z.RefinementCtx): void {
  unique(artifact.commits.map((commit) => commit.sha), context, ['commits'], 'commit');
  unique(artifact.changes.map((change) => change.id), context, ['changes'], 'change');
  unique(artifact.changes.map((change) => `${change.commit}:${change.path}`), context, ['changes'], 'changed path in commit');
  unique([...artifact.commits.map((commit) => commit.sha), ...artifact.excludedCommits.map((commit) => commit.sha)], context, ['excludedCommits'], 'included or excluded commit');
  unique(artifact.files.map((file) => file.reference), context, ['files'], 'reference file');
  unique(artifact.diagrams.map((file) => file.file), context, ['diagrams'], 'diagram asset');
  checkAssets(artifact, context);
  checkCoverage(artifact, context);
  checkTimeline(artifact, context);
}

function checkAssets(artifact: Artifact, context: z.RefinementCtx): void {
  const expected = new Set(artifact.content.references.map((ref) => ref.id));
  const metadata = new Map<string, string>();
  const blobs = new Map<string, string>();
  for (const [index, file] of artifact.files.entries()) {
    if (!expected.has(file.reference)) issue(context, ['files', index], `Extra reference file ${file.reference}`);
    if (file.file !== `files/${file.sha256}.txt`) issue(context, ['files', index, 'file'], 'Noncanonical source asset path');
    const description = JSON.stringify([file.blob, file.bytes, file.lines]);
    if (metadata.has(file.sha256) && metadata.get(file.sha256) !== description) {
      issue(context, ['files', index], 'Inconsistent metadata for identical source bytes');
    }
    metadata.set(file.sha256, description);
    if (blobs.has(file.blob) && blobs.get(file.blob) !== file.sha256) issue(context, ['files', index], 'Inconsistent bytes for Git blob');
    blobs.set(file.blob, file.sha256);
  }
  const expectedDiagrams = new Set(artifact.content.chapters.flatMap((chapter) => chapter.diagrams.flatMap((diagram) =>
    ['landscape', 'portrait'].map((layout) => `${chapter.id}/${diagram.id}-${layout}`))));
  for (const [index, file] of artifact.diagrams.entries()) {
    const key = `${file.chapter}/${file.diagram}-${file.layout}`;
    if (!expectedDiagrams.delete(key)) issue(context, ['diagrams', index], `Extra diagram asset ${key}`);
    if (file.file !== `diagrams/${key}.svg`) issue(context, ['diagrams', index, 'file'], 'Noncanonical diagram asset path');
  }
  for (const key of expectedDiagrams) issue(context, ['diagrams'], `Missing diagram ${key}`);
  const files = new Map(artifact.files.map((file) => [file.reference, file]));
  const revisions = new Map<string, string>();
  for (const [index, ref] of artifact.content.references.entries()) {
    const file = files.get(ref.id);
    if (!file || ref.endLine > file.lines) issue(context, ['content', 'references', index], `Missing or out-of-range file for ${ref.id}`);
    const revision = `${ref.commit}:${ref.path}`;
    if (file && revisions.has(revision) && revisions.get(revision) !== file.blob) {
      issue(context, ['files'], 'Inconsistent file for commit:path');
    }
    if (file) revisions.set(revision, file.blob);
  }
}

function checkCoverage(artifact: Artifact, context: z.RefinementCtx): void {
  const changes = new Map(artifact.changes.map((change) => [change.id, change]));
  const chapters = new Map(artifact.content.chapters.map((chapter) => [chapter.id, chapter]));
  for (const [index, assignment] of artifact.content.assignments.entries()) {
    const change = changes.get(assignment.change);
    if (!change) issue(context, ['content', 'assignments', index], `Unknown change ${assignment.change}`);
    else if (!chapters.get(assignment.chapter)?.sections.some((section) => section.commit === change.commit)) {
      issue(context, ['content', 'assignments', index], 'Assigned change has no section in its primary chapter');
    }
    changes.delete(assignment.change);
  }
  if (changes.size) issue(context, ['content', 'assignments'], `Unassigned changes: ${[...changes.keys()].join(', ')}`);
  for (const chapter of artifact.content.chapters) {
    if (!artifact.content.assignments.some((assignment) => assignment.chapter === chapter.id)) {
      issue(context, ['content', 'chapters'], `Chapter owns no changes: ${chapter.id}`);
    }
  }
}

function checkTimeline(artifact: Artifact, context: z.RefinementCtx): void {
  const order = new Map(artifact.commits.map((commit, index) => [commit.sha, index]));
  const includedOrExcluded = new Set([...order.keys(), ...artifact.excludedCommits.map((commit) => commit.sha)]);
  const allowed = new Set([...includedOrExcluded, artifact.source.baseSha, artifact.source.mergeBaseSha]);
  if (!includedOrExcluded.has(artifact.source.headSha)) issue(context, ['source', 'headSha'], 'Head must be an included or explicitly excluded commit');
  const phases = new Map(artifact.commits.map((commit) => [commit.sha, commit.phase]));
  if (phases.get(artifact.source.baseSha) === 'pr' || phases.get(artifact.source.mergeBaseSha) === 'pr') {
    issue(context, ['source'], 'Base and merge base cannot be PR commits');
  }
  for (const [index, commit] of artifact.commits.entries()) {
    if (commit.parents.some((parent) => order.has(parent) && order.get(parent)! >= index)) {
      issue(context, ['commits', index], 'Commits must be in ancestor-first order');
    }
    if (commit.phase === 'before-pr' && commit.parents.some((parent) => phases.get(parent) === 'pr')) {
      issue(context, ['commits', index], 'Pre-PR commit cannot descend from a PR commit');
    }
    if (commit.phase === 'pr' && !artifact.changes.some((change) => change.commit === commit.sha)) {
      issue(context, ['commits', index], 'PR commit has no source changes');
    }
  }
  for (const [index, change] of artifact.changes.entries()) {
    if (phases.get(change.commit) !== 'pr') issue(context, ['changes', index], 'Change must belong to a PR commit');
  }
  for (const [index, ref] of artifact.content.references.entries()) {
    if (!allowed.has(ref.commit)) issue(context, ['content', 'references', index, 'commit'], 'Unknown reference commit');
  }
  const refs = new Map(artifact.content.references.map((ref) => [ref.id, ref]));
  for (const [index, chapter] of artifact.content.chapters.entries()) {
    const path: IssuePath = ['content', 'chapters', index];
    const first = chapter.sections[0]!;
    if (first.commit !== artifact.source.headSha || !first.blocks.some((block) =>
      block.kind === 'code' && refs.get(block.reference)?.commit === artifact.source.headSha)) {
      issue(context, path, 'Chapter must start with inline code at the pinned head');
    }
    if (!first.blocks.some((block) => block.kind === 'diagram' && chapter.diagrams.some((diagram) =>
      diagram.id === block.diagram && diagram.commit === artifact.source.headSha))) {
      issue(context, path, 'Chapter must start with a diagram at the pinned head');
    }
    let previous = -1;
    for (const section of chapter.sections.slice(1)) {
      const position = order.get(section.commit);
      if (position === undefined) issue(context, path, `Unknown section commit ${section.commit}`);
      else if (position <= previous) issue(context, path, 'Historical sections must be in ancestor-first order');
      previous = position ?? previous;
    }
    for (const diagram of chapter.diagrams) {
      if (!allowed.has(diagram.commit)) issue(context, path, 'Unknown diagram commit');
    }
  }
}

export const validateDraft = (input: unknown): Draft => draftSchema.parse(input);
export const validateArtifact = (input: unknown): Artifact => artifactSchema.parse(input);
