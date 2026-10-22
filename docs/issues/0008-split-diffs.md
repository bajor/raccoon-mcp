---
type: Issue
description: Deliver explicit comparison evidence, library rendering and generation enforcement.
status: In progress
---

# Deliver split diffs

Implement [requirements](/prd/0004-split-diffs.md) in ordered PRs:

1. Extend the portable contract and verify Git endpoints.
2. Synchronize the reader contract and integrate library rendering.
3. Fit split diffs to wide/narrow screens and paper.
4. Enforce explicit change comparisons in authoring and update the skill.

Use the [behavior test matrix](/bdr/0010-comparisons.md). Regenerate only the
explicitly authorized PR after both applications are deployed.
