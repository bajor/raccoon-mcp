---
type: Architecture View
description: Contract ownership and the boundary between agent prose and Git source.
---

# Architecture

`src/contract.ts` owns artifact version 1. It has no Node dependencies and can be
vendored, with provenance, into the reader. Schema changes require an explicit
version decision; readers reject unsupported versions rather than guessing.

An agent submits narrative blocks, references, change assignments and graph data.
The builder will validate those relationships, resolve full files through Git,
render graphs without executing agent-provided markup, and produce the portable
artifact. Stored file checksums let the reader detect incomplete or modified imports.

The catalog identifies the source repository and lists PR manifests. A manifest
owns one generation, its frozen source, timeline, source-file index and diagrams.
Identical file bytes are stored once within a generation.

Diagram nodes cite code references. A source change belongs to one primary thread;
other threads may cite it as context. This preserves coverage without duplicating
ownership. A thread may span commits and a commit may affect multiple threads.

The packaged `changes` inventory is deterministic: one changed source path per PR
commit. Every entry has one primary thread, and that thread must explain the
commit in a stage. Other threads may cite the same path. The builder, not the
agent, supplies the inventory. Contract validation checks coverage against it;
the builder additionally checks it against Git. Commit arrays and thread stages
are ancestor-first. References may also name the pinned base, merge base or head.

Narrative is plain text, not Markdown or HTML. Code blocks are rejected as an
authoring guard; only Git asset references are authoritative code. It is not
possible to prove from prose alone that an agent did not invent an inline quote.
All exported schemas enforce relationship checks, including direct `safeParse`.

Architecture views are inspected during PR review. Per the global review-artifact
policy, Mermaid is rendered outside the repository and only temporary SVGs are
committed under `visual-explanations/`. Permanent docs retain the textual contract.
