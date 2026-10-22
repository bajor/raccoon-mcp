---
type: PRD
description: English articles with functional chapters, inline evidence and printable diagrams.
status: Superseded
superseded_by: "0003"
supersedes: "0001"
---

# Continuous learning articles

The user approved a book-like reading experience on 2026-10-19 and explicitly
removed backward compatibility from scope. This replaces [thread navigation](/prd/0001-understanding.md).

1. Generate one English title, introduction and ordered set of functional chapters.
2. Explain the finished mechanism first. Integrate every owned PR commit and
   relevant older history into ordinary chapter sections, without history navigation.
3. Order prose, exact Git excerpts and diagrams explicitly. Keep complete source
   files as authoritative package evidence, not as a separate reading workspace.
4. Preserve honest evidence labels, full-history investigation, private profiles,
   coverage and atomic publication. Language is English even if the profile differs.
5. Supply compact horizontal and vertical static diagrams for automatic screen and
   print fitting. No manual zoom is required.
6. Reject older formats with no adapter. Existing artifacts require regeneration.

| Quality scenario | Required response | Instrument |
|---|---|---|
| Invalid inline ID or future evidence | Reject the whole package | Contract and Git integration tests |
| Full diagram labels, cycles or fan-out | Fit all geometry within both SVG viewports | Diagram geometry tests |
| Local import or publication fails | Preserve the prior valid generation | Existing publication and reader tests |

Acceptance requires the [article contract](/adr/0002-article-contract.md), its
[behavior](/bdr/0007-article.md), an English generation and physical iPad reading.
