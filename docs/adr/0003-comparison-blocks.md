---
type: ADR
description: Extend the ordered article with explicit Git comparison endpoints.
status: Accepted
---

# Explicit comparison blocks

Implement [split-diff requirements](/prd/0004-split-diffs.md) by adding
`{kind: "diff", before: REFERENCE_OR_NULL, after: REFERENCE_OR_NULL}` to v2.
This is an additive extension: existing v2 data keeps its meaning, without a
legacy adapter. Updated readers are required for new diff blocks.

Both endpoints resolve to complete, checksummed Git files. Reference ranges
describe the focus, not independently sliced diff inputs. A missing file is
`null`; an existing empty file has a `0-0` range and its real empty Git blob.
The result belongs to its section revision. The baseline must be an earlier
ancestor at the same path. Renames use deletion/addition, matching the existing
no-renames inventory. Additions/deletions are checked against Git presence.

Reject pairing consecutive code blocks heuristically: author order does not
identify a comparison. Reject generated HTML: imported content stays data.
The reader will use `@pierre/diffs` directly for parsing, alignment and rendering,
not a local diff algorithm or React migration. Its Apache-2.0 license permits use.

# References

1. THE PIERRE COMPUTER COMPANY. *Diffs documentation*. Available at:
   <https://diffs.com/llms-full.txt>. Accessed on: 2026-10-22.
