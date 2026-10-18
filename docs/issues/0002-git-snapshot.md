---
type: Issue
description: Supply deterministic Git evidence for the already-approved agent-driven builder.
status: closed
---

# Implement frozen Git evidence

Implement [safe frozen Git data](/bdr/0002-git-snapshot.md). Keep Git object reading
separate from PR discovery, prose authoring and publication. Acceptance is the
behavior record's real-Git checks with no executed source hooks or filters.
