---
type: BDR
description: Reject text-heavy generations without changing the portable version-2 reader contract.
status: Implemented
---

# Visual-first publication

The user approved enforced visual-first generation on 2026-10-22. This extends
[article behavior](/bdr/0007-article.md), preserving its evidence, history, privacy
and atomic-publication rules. The stored version-2 format does not change; older
valid artifacts remain readable. Only newly submitted generations face this gate.

1. A chapter opens with a diagram and places at least two distinct code ranges at
   that section's revision: the changed mechanism and relevant surrounding code.
   Repeating a range under another ID does not count as additional context.
2. Every section opens with code or a diagram and includes code. Its prose-block
   count cannot exceed its distinct code/diagram placements.
3. Limits, measured as whitespace-separated words: introduction 60, history note
   80, chapter summary 30, each caption 60 and all captions in one section 120.
4. An inline code range contains at most 80 lines. A focused graph has at most
   8 nodes and 12 edges. Split larger mechanisms into useful views, not filler.

The [numbered context API](/bdr/0008-code-context.md) supplies real surrounding
lines. Structural checks cannot prove that a selected caller, graph or caption is
useful; the author must inspect that relevance and must not pad a draft to pass.

`src/authoring.ts` owns this generation policy. Both the MCP publication input and
the package builder apply the same schema. `src/contract.ts` remains the portable
format validator, not a policy that retroactively invalidates reader imports.

Acceptance: focused authoring tests reject each limit and missing visual/code
structure; a package integration test verifies that direct builds cannot bypass
the gate. Rejection must preserve the previous generation and allow correction
under the existing session rules.
