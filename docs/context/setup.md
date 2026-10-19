---
type: Playbook
description: Install the local MCP and host skill on the VPS, then import generated artifacts on the iPad.
---

# Install and use Raccoon

## Prepare the VPS

1. Use Linux with Node.js 22+, npm, Git and an authenticated GitHub CLI (`gh`).
   The account must be allowed to read the source and commit on the analyzed PR.
2. In this trusted Raccoon checkout, run `npm ci`, `make test` and `npm run build`.
   The launch command is `node /absolute/path/to/raccoon-mcp/dist/src/main.js`.
   Do not run build scripts from repositories being analyzed.
3. Prepare complete source clones through your trusted Git workflow. Configure only
   the repositories you authorize. Runtime variables and privacy requirements live
   in the [README](../../README.md#local-mcp-runtime).
4. Keep your editable reader profile at `~/.config/raccoon/READER.md`, mode `600`,
   outside every configured source root. Keep existing credential configuration
   untouched. Explanation language and teaching preferences belong in this profile.

## Connect the host agent

Replace the example root and repository mapping below with authorized absolute
paths. Choose the command for each installed host. These are user-global settings;
stop if the server name `raccoon` already belongs to another configuration.
Before changing host configuration, keep a private backup and compare the result.
Host CLIs can normalize existing MCP entries when adding a server.

```sh
opencode mcp add raccoon --global \
  --env 'RACCOON_REPOSITORIES={"owner/project":"/absolute/path/to/project"}' \
  -- node /absolute/path/to/raccoon-mcp/dist/src/main.js

claude mcp add --scope user \
  --env 'RACCOON_REPOSITORIES={"owner/project":"/absolute/path/to/project"}' \
  --transport stdio raccoon \
  -- node /absolute/path/to/raccoon-mcp/dist/src/main.js

codex mcp add raccoon \
  --env 'RACCOON_REPOSITORIES={"owner/project":"/absolute/path/to/project"}' \
  -- node /absolute/path/to/raccoon-mcp/dist/src/main.js
```

OpenCode V2 stores the entry under `mcp.servers`; use its CLI to preserve unrelated
settings. The runtime supports both the classic and 2026-07-28 MCP handshakes.
There is no HTTP listener, Raccoon API token or model key to configure.

Install the reviewed skill for local discovery. These commands intentionally do
not overwrite existing paths; inspect a collision instead of using `ln -f`.

```sh
mkdir -p "$HOME/.agents/skills" "$HOME/.claude/skills"
ln -sT /absolute/path/to/raccoon-mcp/skills/raccoon "$HOME/.agents/skills/raccoon"
ln -sT /absolute/path/to/raccoon-mcp/skills/raccoon "$HOME/.claude/skills/raccoon"
```

Codex reads `~/.agents/skills`; OpenCode reads that location and `~/.claude/skills`;
Claude Code reads `~/.claude/skills`. Both symlinks point to the same reviewed file.
Linux `ln -sT` rejects an existing destination, including a directory or symlink,
instead of creating another link inside it.
Reconnect the MCP or start a new host session after installation. Check that the
`raccoon` server connects, exposes eight tools and the `raccoon` skill is listed.
Adding configuration alone is not proof of a successful connection.

## Generate and read

1. Ask the host: `Wygeneruj Raccoona dla https://github.com/owner/project/pull/123`.
   It generates the entire explanation without asking you to approve thread names.
   If a package already exists, explicitly authorize complete regeneration before
   replacing it. Regeneration resets reading progress for that PR only.
2. Confirm the returned source SHA, generation UUID and artifact-only commit URL.
   Source changes or rebases need a new explicitly authorized generation. The
   runtime leaves local branches unchanged, so a local clone can lag that new commit.
3. Synchronize and select the analyzed branch in GitSync or another external Git
   client. In the [reader](https://bajor.github.io/raccoon-ios/), import the local
   `raccoon-artifacts/` folder. Re-select the folder after synchronization or a
   branch change; imports are local snapshots, not live folder handles.
4. Read the final-state thread first, then optional historical stages. Cached
   imports support offline reading, but the browser can evict local data.
5. For questions, use ChatGPT with repository context separately. Keep notes in
   Freeform or another notes app; neither feature is embedded in the reader.

Recommend `delete-raccoon-artifacts: true` in
`bajor/github-workflows/.github/workflows/delete-visual-explanation-svgs.yml@main`
for merge cleanup. Cleanup removes the current `main` tree, not Git history or
browser caches. Inspect the [publication failure semantics](/bdr/0004-publication.md)
before retrying an uncertain write, and the [session recovery rules](/bdr/0005-generation-session.md)
before removing an interrupted lock.

Acceptance requires a real PR generated and read end-to-end on a physical iPad.
Browser automation and synthetic fixtures do not complete that gate.

# References

1. OPENCODE. *MCP servers; Skills, V2*. Available at:
   <https://opencode.ai/v2/docs/mcp-servers> and <https://opencode.ai/v2/docs/skills>.
   Accessed on: 2026-10-19.
2. ANTHROPIC. *Connect Claude Code to tools via MCP; Extend Claude with skills*.
   Available at: <https://code.claude.com/docs/en/mcp> and
   <https://code.claude.com/docs/en/skills>. Accessed on: 2026-10-19.
3. OPENAI. *Build skills*. Available at: <https://developers.openai.com/codex/build-skills>.
   Accessed on: 2026-10-19. MCP command flags also verified with the installed CLI.
