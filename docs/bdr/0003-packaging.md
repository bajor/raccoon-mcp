---
type: BDR
description: Build a complete learning snapshot from agent references and exact Git objects, never agent-supplied code.
status: Superseded
superseded_by: "0007"
---

# Package Git-backed explanations

The approved [requirements](/prd/0001-understanding.md) and
[agent-driven boundary](/adr/0001-offline-boundary.md) require a deterministic
package. Input is a frozen PR identity, a narrative/reference draft and private
reader-profile bytes. Output is a validated manifest and canonical asset bytes in
memory. Publication is a separate boundary. No source-repository scripts run.

The builder freezes the PR itself, validates the draft, resolves selected historical
commits, reads exact full regular Git files, renders static graphs, and validates
the final artifact. Selected pre-PR commits must be ancestors of both pinned base
and head. Earlier stages cannot cite later source as if it existed at that stage.
Every thread has final-state source and a diagram pinned to the frozen head.

## Scenarios

1. Given a valid explanation, when built, include exact historical source bytes,
   immutable blob IDs, byte/line metadata, checksums and static diagrams.
2. Given an out-of-range reference or incomplete change ownership, when built,
   reject the entire package rather than dropping the reference or change.
3. Given a selected unrelated or future historical revision, when built, reject it.
4. Given reader-profile bytes, when built, include only their SHA-256 hash, never
   the profile contents. The input draft remains responsible for keeping prose private.
5. Given labels containing markup, when rendered, escape them as literal text.
   Labels with invalid XML characters fail instead of producing an unsafe SVG.

## Test design

| Case | Level | Observable assertion and purpose |
|---|---|---|
| Real PR package | Git integration | Complete bytes and older stages match Git while dirty source and profile text are absent |
| Invalid draft/reference | Git integration | No package is returned for bad coverage or line bounds |
| Invalid historical revision | Git integration | Unrelated evidence cannot enter the timeline |
| Graph label | Unit | Markup is escaped and invalid XML characters rejected |

The reader's existing 200 MiB import limit also bounds a built package. Each Git
command retains the limits in [frozen Git data](/bdr/0002-git-snapshot.md). Graphs
remain bounded to 24 nodes by the contract and 96 edges by the renderer; split
denser explanations into multiple diagrams. These are explicit failures, not truncation.

## Review amendment

Wrap edge labels in a reserved gutter outside node rectangles, including self-loops.
The SVG viewport includes that gutter, so accepted 80-character edge labels remain
visible instead of being hidden by nodes or clipped at the diagram boundary.

Each edge gets a separate label lane, including edges sharing their source node.
Paint all paths before labels so later edges cannot obscure earlier label text.
A focused fan-out geometry regression checks that complete label bounds do not overlap.
