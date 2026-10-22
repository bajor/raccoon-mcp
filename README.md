# Raccoon MCP

Prepare an offline explanation of agent-written code for a human. Raccoon is for
understanding a PR, not reviewing, editing or merging it.

The agent using the supplied skill writes explanations and code references. The
MCP server reads Git objects, validates references, copies real files, and builds
one complete English explanation per PR: diagram-first chapters, side-by-side
changes, exact code with surrounding context, and short concrete captions. Publication rejects text-heavy
drafts. It does not call a model or require an AI API key.

Artifact version 2 replaces the former reading workspace. Older packages are
unsupported and must be explicitly removed and regenerated, not migrated silently.
The visual-first authoring policy keeps the version-2 layout; existing v2 imports
remain valid. See the [publication limits](docs/bdr/0009-visual-first-authoring.md).
New generations also require [exact first-parent diffs](docs/bdr/0010-comparisons.md)
for every owned change, not sequential before/after code blocks.

The companion [web reader](https://github.com/bajor/raccoon-reader) imports local
artifacts on an iPad. No private source is uploaded to that reader's host.

## Development

Node.js 22+, npm and Git are required. GitHub operations additionally use `gh`.

```sh
npm ci
make test
```

## Local MCP runtime

On the Linux VPS, run `npm run build`, then configure the host to launch
`node /absolute/path/to/raccoon-mcp/dist/src/main.js` over stdio. Only protocol
messages use stdout. No network listener or AI API key is needed.

| Environment variable | Value or default |
|---|---|
| `RACCOON_REPOSITORIES` | JSON object mapping `owner/repo` to absolute clone roots; default `{}` authorizes nothing |
| `RACCOON_PROFILE_PATH` | Private explanation preferences; default `~/.config/raccoon/READER.md` |
| `RACCOON_STATE_DIRECTORY` | Exclusive PR locks; default `~/.local/state/raccoon` |

Create the profile with mode `600`, outside source clones. Lock state also stays
outside clones and is private to the same Linux user. Existing Raccoon
`config.json` files are neither read nor modified. GitHub operations use that user's
existing `gh` login. Clones must already contain complete PR history; the server
does not fetch through untrusted source-repository configuration.

The tool catalog includes inspection, explicit begin/regeneration, paged Git
evidence, complete publication and cancellation. A crash leaves an exclusive lock;
stop its owning process before removing only the exact reported lock file.
See [session behavior](docs/bdr/0005-generation-session.md) for failure semantics.

## Agent commit discipline

Add instructions to your coding agent's `AGENTS.md` (and `CLAUDE.md` for Claude
Code) to make small, descriptive commits frequently, one completed logical change
per commit, with the reason for non-obvious decisions. Keep one cohesive
functionality per PR. Preserve these commits rather than squashing their history:
Raccoon uses it to explain how the mechanism evolved, including reversals.

## Docs index

[Documentation](docs/index.md) contains the ratified scope and contract.
[Install and use Raccoon](docs/context/setup.md) covers OpenCode V2, Claude Code
and Codex setup, the [generation skill](skills/raccoon/SKILL.md), and iPad import.
