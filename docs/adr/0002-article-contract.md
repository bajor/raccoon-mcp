---
type: ADR
description: Replace the workspace model with a version-2 ordered article contract.
status: Accepted
---

# Ordered article contract

## Context

The user chose continuous reading and explicitly rejected compatibility code.
The old current/stage/reference workspace imposes navigation on the explanation.
Generated HTML was offered as an alternative, but adds executable-content risks
and separates presentation from structured Git evidence.

## Decision

Use version 2 only. A draft has an English title, introduction, chapters and
section-level revision context. Each section contains ordered, discriminated
prose/code/diagram blocks. A chapter represents one functional thread. Its first
section explains the head; later sections explain ancestry in order. Assign each
change to one chapter with a section at that revision.

Resolve code blocks through full Git-file assets. Render each bounded graph with
Dagre in left-to-right and top-to-bottom layouts, recording viewport dimensions
and separate checksums. Dagre and its graphlib dependency are MIT licensed. Use
the maintained layout engine instead of extending the hand-written rank/gutter
algorithm, whose outgoing-edge lanes make wide diagrams sparse.

## Consequences

The reader consumes one article model without reference, stage or compatibility
navigation. Older packages cannot open or regenerate in place through version-2
tools; their owners must explicitly remove the old artifact before creating a new
one. No automatic deletion or legacy ownership inference is introduced.

Contract tests enforce block relationships and dual assets; real-Git integration
tests enforce source ranges and temporal evidence. Rendering and publication
remain deterministic server responsibilities. The agent never supplies code or SVG.
