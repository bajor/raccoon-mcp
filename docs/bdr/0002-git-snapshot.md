---
type: BDR
description: Read a complete pinned PR inventory and exact historical files without running source-repository code.
status: Implemented
---

# Safe frozen Git data

The flow is repository validation, full commit validation, merge-base calculation,
ancestor-first PR traversal, changed-path classification, then exact blob reads.
All operations use Git objects, never working-tree source or model-supplied code.

1. Given a PR head and base, when frozen, then every PR commit is included as source
   work or explicitly excluded as generated-only or no-source-change.
2. Given a file reference, when resolved, then return its complete regular Git blob,
   UTF-8 text and real line count. Reject binary, symlink and invalid ranges.
3. Given hostile hooks, filters, diff drivers or filesystem-monitor configuration,
   when inspecting Git, then no repository-supplied command executes.
4. Given historical code, when browsing, then paginate without a total search cap.
   A shallow clone is rejected rather than presented as complete history.

Changed paths are compared to each commit's first parent, including merge commits.
Root commits compare to the empty tree. Rename detection is disabled for inventory
stability: a rename is represented as a deletion and addition. History browsing can
follow a single path's renames. `raccoon-artifacts/` and review SVGs are excluded
with explicit reasons. Other changed paths remain source work.

## Test design

| Case | Level | Assertion and purpose |
|---|---|---|
| Real multi-commit PR | Git integration | Inventory includes reverted/deleted paths and accounts for empty/generated commits |
| Historical file | Git integration | Full bytes, inclusive ranges and older stages use Git, not dirty source |
| Hostile Git configuration | Git integration | Inspection leaves execution sentinel absent |
| Paged history | Git integration | Later pages expose older commits rather than silently stopping |

Verification limits are explicit: command output is bounded to 16 MiB and each
command to 30 seconds. Exceeding either fails, never silently truncates evidence.

## Implementation amendment: review regressions

Disable lazy fetching and grafts, including inherited Git environment overrides.
Reject partial-clone configurations before object access and deny all transport
protocols in the read-only environment, including on older Git versions without
`GIT_NO_LAZY_FETCH`. Inspection cannot invoke a promisor remote's command.
PR inventory is `baseSha..headSha`, not the range from one selected
merge base, so criss-cross histories do not introduce shared base commits. Path
pagination traverses skipped renames before selecting the requested page.
