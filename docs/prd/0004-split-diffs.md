---
type: PRD
description: Explain changes with library-rendered side-by-side diffs and Python-first highlighting.
status: Accepted
---

# Side-by-side changes

Requested on 2026-10-22: replace sequential before/after code with horizontal
comparisons. Keep diagrams, current surrounding code and concise English captions.
Use a maintained library, not copied algorithms. Python is the primary language.

The reader must display both revisions together, preserve indentation and real
line numbers, support narrow screens and printing, and work offline without
uploading source. New generations must place an explicit diff for every owned
text change. Existing valid version-2 articles remain readable.

Acceptance: [comparison behavior](/bdr/0010-comparisons.md), reader browser tests
for literal Python, split geometry and offline reopening, plus an explicitly
authorized regenerated PR artifact. Physical iPad/printer checks remain manual.
