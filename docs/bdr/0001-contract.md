---
type: BDR
description: Reject invalid relationships instead of silently repairing or dropping evidence.
status: Accepted
---

# Validate a complete artifact

The observable flow is input, structural validation, relationship validation, then
acceptance or an error. No malformed reference or missing diagram is silently dropped.
A rendered flow accompanies the implementing PR under the global SVG-only policy.

## Scenarios

1. Given a complete draft, when validated, then all narrative and diagram references resolve.
2. Given a dangling ID or duplicate ownership, when validated, then generation fails.
3. Given a packaged artifact, when validated, then each reference has a full file
   with enough lines, each stage names a known commit, and each diagram has an asset.

## Test design

| Case | Level | Observable assertion | Proves |
|---|---|---|---|
| Complete draft | Unit | Accepted without loss of content | Valid author input is usable |
| Invalid graph | Unit | Duplicate and dangling relationships rejected | No silent data loss |
| Incomplete package | Unit | Missing assets or invalid ranges rejected | Reader cannot accept broken navigation |

See [requirements](/prd/0001-understanding.md).
