---
type: BDR
description: Return exact Git excerpts with bounded surrounding lines and a reusable reference range.
status: Implemented
---

# Numbered code context

This extends [safe Git evidence](/bdr/0002-git-snapshot.md) for the inline code
required by [learning articles](/prd/0002-continuous-article.md).

`read_file` accepts an optional `contextLines` count, from 0 to 40, defaulting to
0. `startLine` and `count` select the focus. The response adds numbered surrounding
lines, clamped to the file, and separates `focus` from a reusable `reference`
containing the revision, path and inclusive range actually returned. No source
comes from the working tree. The existing byte and response limits still apply.

1. Given a middle-of-file focus, when context is requested, then include the
   requested lines on both sides without changing the focus.
2. Given a focus near either file boundary, when context extends past it, then
   clamp the reference to the real file and preserve its line numbers.
3. Given an empty regular Git file, when read, then return no lines and null focus
   and reference instead of inventing line 1.

Acceptance: the MCP integration tests verify these scenarios over real frozen
Git objects. Packaging continues to store complete files, not padded model text.
