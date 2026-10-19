---
type: Issue
description: Deliver the ordered English article contract and dual diagram packaging.
status: Implemented
---

# Generate continuous articles

Implement [requirements](/prd/0002-continuous-article.md) using the
[article decision](/adr/0002-article-contract.md). Replace old draft shapes and
renderer, update the generation skill, and remove obsolete code and tests.
Verification follows the [behavior test design](/bdr/0007-article.md).

Acceptance: `make test` and build pass; the reader can vendor the pinned version-2
contract. Publication, privacy and Git-evidence invariants remain intact.
