---
type: Constitution
title: Raccoon constitution
description: Scope and invariants approved on 2026-10-18.
status: Amended
---

# Raccoon constitution

Raccoon helps the person who commissioned agent-written code understand the
result. It organizes a PR into functional threads, not review findings.

Amendment, 2026-10-19: publish an English, continuous article whose chapters
represent those threads. Code and diagrams appear inline; history belongs in
chapter prose. The user removed backward compatibility from scope. Version 2
replaces the current/stage workspace model rather than adding another reader path.

Amendment, 2026-10-22: diagrams and exact code, including surrounding code, lead
the explanation. Enforce concise captions at publication, without changing the
portable version-2 layout or invalidating existing reader imports.

A snapshot pins a PR's Git revisions. Each thread explains the resulting
mechanism, relevant existing code, every relevant PR commit, and selected older
history. Code references identify a full commit hash, path and inclusive 1-based
line range. Git supplies source bytes; an agent never supplies copied code.

One complete generation is active per PR. Regeneration requires explicit consent,
rebuilds the whole snapshot, and resets that PR's reading progress. Failed
generation does not replace a published artifact.

The host agent executes a skill; an MCP server supplies deterministic Git access,
validation and packaging. A client-only web reader imports local folders. GitSync
is external; branch selection and synchronization happen outside the reader.

Review comments, source editing, merging, an embedded chatbot, terminal support,
and a native iOS application are outside scope.
