import { z } from 'zod';

export const ARTIFACT_ROOT = 'raccoon-artifacts';
export const CONTRACT_VERSION = 1;
// IDs become portable filenames, including on case-insensitive filesystems.
const id = z.string().max(64).regex(/^[a-z0-9][a-z0-9_-]*$/);
export const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const repository = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/);
export const relativePath = z.string().min(1).refine((value) =>
  !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'Expected a repository-relative path without traversal');
const text = z.string().trim().min(1);

export const commitSchema = z.strictObject({
  sha, subject: text, parents: z.array(sha), phase: z.enum(['pr', 'before-pr']),
});
export const changeSchema = z.strictObject({
  id, commit: sha, path: relativePath, status: z.enum(['added', 'modified', 'deleted', 'renamed', 'type-changed']),
});
export const referenceSchema = z.strictObject({
  id, commit: sha, path: relativePath,
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).refine((ref) => ref.endLine >= ref.startLine, 'Reversed line range');

export const blockSchema = z.strictObject({
  text: text.refine((value) => !/```|~~~|^(?: {4}|\t)\S|<\/?(?:pre|code)\b/im.test(value),
    'Source code belongs in references, not narrative code blocks'),
  evidence: z.enum(['fact', 'inference', 'unknown']),
  refs: z.array(id).min(1),
});
const diagramSchema = z.strictObject({
  id, title: text, commit: sha,
  nodes: z.array(z.strictObject({ id, label: text.max(160), refs: z.array(id).min(1) })).min(1).max(24),
  edges: z.array(z.strictObject({ from: id, to: id, label: z.string().max(80) })),
});
export const threadSchema = z.strictObject({
  id, title: text.max(100), summary: text,
  current: z.array(blockSchema).min(1),
  stages: z.array(z.strictObject({ commit: sha, title: text, blocks: z.array(blockSchema).min(1) })).min(1),
  diagrams: z.array(diagramSchema).min(1),
});
const draftShape = z.strictObject({
  references: z.array(referenceSchema).min(1),
  threads: z.array(threadSchema).min(1),
  assignments: z.array(z.strictObject({ change: id, thread: id })).min(1),
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
  content: draftSchema,
  files: z.array(z.strictObject({
    reference: id, blob: sha, sha256: digest, file: relativePath,
    bytes: z.number().int().nonnegative(), lines: z.number().int().nonnegative(),
  })).min(1),
  diagrams: z.array(z.strictObject({ thread: id, diagram: id, file: relativePath, sha256: digest })).min(1),
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
  unique(draft.threads.map((thread) => thread.id), context, ['threads'], 'thread ID');
  unique(draft.assignments.map((assignment) => assignment.change), context, ['assignments'], 'change assignment');
  const refs = new Set(draft.references.map((ref) => ref.id));
  const threads = new Set(draft.threads.map((thread) => thread.id));
  const checkRefs = (ids: string[], path: IssuePath) => {
    for (const ref of ids) if (!refs.has(ref)) issue(context, path, `Unknown reference ${ref}`);
  };
  for (const [index, assignment] of draft.assignments.entries()) {
    if (!threads.has(assignment.thread)) issue(context, ['assignments', index, 'thread'], `Unknown thread ${assignment.thread}`);
  }
  for (const [index, thread] of draft.threads.entries()) {
    const path: IssuePath = ['threads', index];
    unique(thread.stages.map((stage) => stage.commit), context, path, `stage in ${thread.id}`);
    unique(thread.diagrams.map((diagram) => diagram.id), context, path, `diagram in ${thread.id}`);
    thread.current.forEach((block, i) => checkRefs(block.refs, [...path, 'current', i, 'refs']));
    thread.stages.forEach((stage, i) => stage.blocks.forEach((block, j) => checkRefs(block.refs, [...path, 'stages', i, 'blocks', j, 'refs'])));
    for (const [i, diagram] of thread.diagrams.entries()) {
      const diagramPath = [...path, 'diagrams', i];
      unique(diagram.nodes.map((node) => node.id), context, diagramPath, `node in ${diagram.id}`);
      const nodes = new Set(diagram.nodes.map((node) => node.id));
      diagram.nodes.forEach((node) => checkRefs(node.refs, diagramPath));
      for (const edge of diagram.edges) {
        if (!nodes.has(edge.from) || !nodes.has(edge.to)) issue(context, diagramPath, `Unknown diagram endpoint in ${diagram.id}`);
      }
    }
  }
}

function checkArtifact(artifact: z.infer<typeof artifactShape>, context: z.RefinementCtx): void {
  unique(artifact.commits.map((commit) => commit.sha), context, ['commits'], 'commit');
  unique(artifact.changes.map((change) => change.id), context, ['changes'], 'change');
  unique(artifact.files.map((file) => file.reference), context, ['files'], 'reference file');
  unique(artifact.diagrams.map((file) => file.file), context, ['diagrams'], 'diagram asset');
  checkAssets(artifact, context);
  checkCoverage(artifact, context);
  checkTimeline(artifact, context);
}

function checkAssets(artifact: Artifact, context: z.RefinementCtx): void {
  const expected = new Set(artifact.content.references.map((ref) => ref.id));
  const metadata = new Map<string, string>();
  for (const [index, file] of artifact.files.entries()) {
    if (!expected.has(file.reference)) issue(context, ['files', index], `Extra reference file ${file.reference}`);
    if (file.file !== `files/${file.sha256}.txt`) issue(context, ['files', index, 'file'], 'Noncanonical source asset path');
    const description = JSON.stringify([file.blob, file.bytes, file.lines]);
    if (metadata.has(file.sha256) && metadata.get(file.sha256) !== description) {
      issue(context, ['files', index], 'Inconsistent metadata for identical source bytes');
    }
    metadata.set(file.sha256, description);
  }
  const expectedDiagrams = new Set(artifact.content.threads.flatMap((thread) => thread.diagrams.map((diagram) => `${thread.id}/${diagram.id}`)));
  for (const [index, file] of artifact.diagrams.entries()) {
    const key = `${file.thread}/${file.diagram}`;
    if (!expectedDiagrams.delete(key)) issue(context, ['diagrams', index], `Extra diagram asset ${key}`);
    if (file.file !== `diagrams/${key}.svg`) issue(context, ['diagrams', index, 'file'], 'Noncanonical diagram asset path');
  }
  for (const key of expectedDiagrams) issue(context, ['diagrams'], `Missing diagram ${key}`);
  const files = new Map(artifact.files.map((file) => [file.reference, file]));
  for (const [index, ref] of artifact.content.references.entries()) {
    const file = files.get(ref.id);
    if (!file || ref.endLine > file.lines) issue(context, ['content', 'references', index], `Missing or out-of-range file for ${ref.id}`);
  }
}

function checkCoverage(artifact: Artifact, context: z.RefinementCtx): void {
  const changes = new Map(artifact.changes.map((change) => [change.id, change]));
  const threads = new Map(artifact.content.threads.map((thread) => [thread.id, thread]));
  for (const [index, assignment] of artifact.content.assignments.entries()) {
    const change = changes.get(assignment.change);
    if (!change) issue(context, ['content', 'assignments', index], `Unknown change ${assignment.change}`);
    else if (!threads.get(assignment.thread)?.stages.some((stage) => stage.commit === change.commit)) {
      issue(context, ['content', 'assignments', index], 'Assigned change has no stage in its primary thread');
    }
    changes.delete(assignment.change);
  }
  if (changes.size) issue(context, ['content', 'assignments'], `Unassigned changes: ${[...changes.keys()].join(', ')}`);
  for (const thread of artifact.content.threads) {
    if (!artifact.content.assignments.some((assignment) => assignment.thread === thread.id)) {
      issue(context, ['content', 'threads'], `Thread owns no changes: ${thread.id}`);
    }
  }
}

function checkTimeline(artifact: Artifact, context: z.RefinementCtx): void {
  const order = new Map(artifact.commits.map((commit, index) => [commit.sha, index]));
  const allowed = new Set([...order.keys(), artifact.source.baseSha, artifact.source.mergeBaseSha, artifact.source.headSha]);
  for (const [index, commit] of artifact.commits.entries()) {
    if (commit.parents.some((parent) => order.has(parent) && order.get(parent)! >= index)) {
      issue(context, ['commits', index], 'Commits must be in ancestor-first order');
    }
    if (commit.phase === 'pr' && !artifact.changes.some((change) => change.commit === commit.sha)) {
      issue(context, ['commits', index], 'PR commit has no source changes');
    }
  }
  const phases = new Map(artifact.commits.map((commit) => [commit.sha, commit.phase]));
  for (const [index, change] of artifact.changes.entries()) {
    if (phases.get(change.commit) !== 'pr') issue(context, ['changes', index], 'Change must belong to a PR commit');
  }
  for (const [index, ref] of artifact.content.references.entries()) {
    if (!allowed.has(ref.commit)) issue(context, ['content', 'references', index, 'commit'], 'Unknown reference commit');
  }
  for (const [index, thread] of artifact.content.threads.entries()) {
    let previous = -1;
    for (const stage of thread.stages) {
      const position = order.get(stage.commit);
      if (position === undefined) issue(context, ['content', 'threads', index, 'stages'], `Unknown stage commit ${stage.commit}`);
      else if (position <= previous) issue(context, ['content', 'threads', index, 'stages'], 'Stages must be in ancestor-first order');
      previous = position ?? previous;
    }
    for (const diagram of thread.diagrams) {
      if (!allowed.has(diagram.commit)) issue(context, ['content', 'threads', index, 'diagrams'], 'Unknown diagram commit');
    }
  }
}

export const validateDraft = (input: unknown): Draft => draftSchema.parse(input);
export const validateArtifact = (input: unknown): Artifact => artifactSchema.parse(input);
