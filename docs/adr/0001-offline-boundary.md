---
type: ADR
description: The host agent writes prose; MCP validates and packages; the web client imports locally.
status: Accepted
---

# Agent-driven builder and offline reader

The user selected the host agent plus a skill instead of an AI process embedded
in MCP. The server therefore owns deterministic operations, not model calls.

The user selected a client-only GitHub Pages reader instead of native iOS and
TestFlight. Safari cannot retain a live handle to a GitSync folder. The accepted
trade-off is manual folder re-import after synchronization or branch changes,
with local snapshots available between imports.

The user selected artifact commits on the analyzed PR branch, rather than a
separate artifact repository or branch. The skill commits and pushes after
successful generation. A recommended reusable workflow cleans merged artifacts
from `main`; deleting files does not erase Git history or browser copies.

Verification: contract tests, builder publication tests and reader import tests.
