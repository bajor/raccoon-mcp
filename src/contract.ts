import { z } from 'zod';

export const ARTIFACT_ROOT = 'raccoon-artifacts';
export const CONTRACT_VERSION = 1;
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
export const relativePath = z.string().min(1).refine((value) =>
  !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'Expected a repository-relative path without traversal');
const text = z.string().trim().min(1);

export const commitSchema = z.strictObject({
  sha, subject: text, parents: z.array(sha), phase: z.enum(['pr', 'before-pr']),
});
export const referenceSchema = z.strictObject({
  id, commit: sha, path: relativePath,
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).refine((ref) => ref.endLine >= ref.startLine, 'Reversed line range');

export const blockSchema = z.strictObject({
  text: text.refine((value) => !value.includes('```') && !value.includes('~~~'),
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
export const draftSchema = z.strictObject({
  references: z.array(referenceSchema).min(1),
  threads: z.array(threadSchema).min(1),
  assignments: z.array(z.strictObject({ change: id, thread: id })).min(1),
  historyNote: text,
});
export const sourceSchema = z.strictObject({
  repository, pr: z.number().int().positive(), title: text,
  branch: text, baseSha: sha, mergeBaseSha: sha, headSha: sha,
});
export const artifactSchema = z.strictObject({
  version: z.literal(CONTRACT_VERSION), generation: z.uuid(), createdAt: z.iso.datetime(),
  source: sourceSchema, profileHash: digest, commits: z.array(commitSchema).min(1),
  content: draftSchema,
  files: z.array(z.strictObject({
    reference: id, blob: sha, sha256: digest, file: relativePath,
    bytes: z.number().int().nonnegative(), lines: z.number().int().nonnegative(),
  })).min(1),
  diagrams: z.array(z.strictObject({ thread: id, diagram: id, file: relativePath, sha256: digest })).min(1),
});
export const catalogSchema = z.strictObject({
  version: z.literal(CONTRACT_VERSION), repository,
  artifacts: z.array(z.strictObject({ pr: z.number().int().positive(), manifest: relativePath })),
}).superRefine((catalog, context) => {
  const seen = new Set<number>();
  for (const item of catalog.artifacts) {
    if (seen.has(item.pr) || item.manifest !== `pr-${item.pr}/manifest.json`) {
      context.addIssue({ code: 'custom', message: 'Duplicate PR or noncanonical manifest path' });
    }
    seen.add(item.pr);
  }
});

export type Draft = z.infer<typeof draftSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Commit = z.infer<typeof commitSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Block = z.infer<typeof blockSchema>;

function unique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${name}`);
}

/** Validate graph relationships in addition to the portable structural schema. */
export function validateDraft(input: unknown): Draft {
  const draft = draftSchema.parse(input);
  unique(draft.references.map((ref) => ref.id), 'reference ID');
  unique(draft.threads.map((thread) => thread.id), 'thread ID');
  unique(draft.assignments.map((assignment) => assignment.change), 'change assignment');
  const refs = new Set(draft.references.map((ref) => ref.id));
  const threads = new Set(draft.threads.map((thread) => thread.id));
  const checkRefs = (ids: string[]) => {
    for (const ref of ids) if (!refs.has(ref)) throw new Error(`Unknown reference ${ref}`);
  };
  for (const assignment of draft.assignments) {
    if (!threads.has(assignment.thread)) throw new Error(`Unknown thread ${assignment.thread}`);
  }
  for (const thread of draft.threads) {
    unique(thread.stages.map((stage) => stage.commit), `stage in ${thread.id}`);
    unique(thread.diagrams.map((diagram) => diagram.id), `diagram in ${thread.id}`);
    thread.current.forEach((block) => checkRefs(block.refs));
    thread.stages.forEach((stage) => stage.blocks.forEach((block) => checkRefs(block.refs)));
    for (const diagram of thread.diagrams) {
      unique(diagram.nodes.map((node) => node.id), `node in ${diagram.id}`);
      const nodes = new Set(diagram.nodes.map((node) => node.id));
      diagram.nodes.forEach((node) => checkRefs(node.refs));
      for (const edge of diagram.edges) {
        if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`Unknown diagram endpoint in ${diagram.id}`);
      }
    }
  }
  return draft;
}

export function validateArtifact(input: unknown): Artifact {
  const artifact = artifactSchema.parse(input);
  validateDraft(artifact.content);
  unique(artifact.commits.map((commit) => commit.sha), 'commit');
  unique(artifact.files.map((file) => file.reference), 'reference file');
  unique(artifact.diagrams.map((file) => file.file), 'diagram asset');
  if (artifact.files.length !== artifact.content.references.length) throw new Error('Extra reference files');
  for (const file of artifact.files) {
    if (file.file !== `files/${file.sha256}.txt`) throw new Error('Noncanonical source asset path');
  }
  for (const file of artifact.diagrams) {
    if (file.file !== `diagrams/${file.thread}/${file.diagram}.svg`) throw new Error('Noncanonical diagram asset path');
  }
  const commits = new Set(artifact.commits.map((commit) => commit.sha));
  const files = new Map(artifact.files.map((file) => [file.reference, file]));
  for (const ref of artifact.content.references) {
    const file = files.get(ref.id);
    if (!file || ref.endLine > file.lines) throw new Error(`Missing or out-of-range file for ${ref.id}`);
  }
  for (const thread of artifact.content.threads) {
    for (const stage of thread.stages) {
      if (!commits.has(stage.commit)) throw new Error(`Unknown stage commit ${stage.commit}`);
    }
    for (const diagram of thread.diagrams) {
      if (!artifact.diagrams.some((file) => file.thread === thread.id && file.diagram === diagram.id)) {
        throw new Error(`Missing diagram ${thread.id}/${diagram.id}`);
      }
    }
  }
  return artifact;
}
