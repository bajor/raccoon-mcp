---
type: Issue
description: Expose the deterministic generation lifecycle over local MCP without model calls.
status: closed
---

# Local MCP generation lifecycle

Implement [generation-session behavior](/bdr/0005-generation-session.md) under the
approved [host-agent boundary](/adr/0001-offline-boundary.md). Add exclusive PR
locks, private configuration, complete-draft orchestration and official stdio MCP
registration. The explanation-writing skill and operator installation are separate.

Acceptance: the lifecycle test matrix passes in both protocol eras, repository
access is explicit, private profile bytes stay outside artifacts and shutdown
cannot release a lock while its publication is still running.
