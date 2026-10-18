---
type: Constitution
title: Raccoon constitution
description: Scope and invariants approved on 2026-10-18.
status: Ratified
---

# Raccoon constitution

Raccoon helps the person who commissioned agent-written code understand the
result. It organizes a PR into functional threads, not review findings.

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
