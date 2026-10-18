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

Architecture views are inspected during PR review. Per the global review-artifact
policy, Mermaid is rendered outside the repository and only temporary SVGs are
committed under `visual-explanations/`. Permanent docs retain the textual contract.
