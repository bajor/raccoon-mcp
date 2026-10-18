---
type: Issue
description: Discover the analyzed PR and publish a complete generation without local source mutations.
status: closed
---

# Atomic PR-branch publication

Implement [publication behavior](/bdr/0004-publication.md) under the approved
[offline boundary](/adr/0001-offline-boundary.md). Keep generation orchestration,
locking and MCP registration for the next slice.

Acceptance: the publication test matrix passes, no source hooks or working-tree
writes occur, and the remote mutation requires both the expected PR head and the
previous generation identity.
