---
type: PRD
description: A self-contained learning artifact organized around functional threads.
status: Superseded
superseded_by: "0002"
---

# Understand agent-written changes

The human needs the mechanism, its connection to existing code, its evolution and
evidence for decisions, without separately browsing the source repository.

## Requirements

1. Start each thread with the final mechanism and frozen source, not the first diff.
2. Include every PR commit affecting the thread, including small commits.
3. Include relevant pre-PR stages without an arbitrary history-count limit.
4. Distinguish facts, inferences and unknown intent. Do not invent discarded alternatives.
5. Copy full referenced Git files and include a diagram set for every thread.
6. Keep the reader local and read-only; settings and reading progress stay on the client.

## Quality requirements

| Stimulus and environment | Required response | Instrument |
|---|---|---|
| Agent submits a bad reference before publication | Reject it; preserve the prior generation | Builder integration tests |
| Reader receives an incomplete local import | Reject the replacement; preserve the old import | Reader import tests |
| Narrative contains untrusted content | Never execute it or upload local source | Browser security tests and inspection |

Acceptance is one real PR generated, imported and read end-to-end on an iPad.
See [contract behavior](/bdr/0001-contract.md) and [architecture decision](/adr/0001-offline-boundary.md).
