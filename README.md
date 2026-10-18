# Raccoon MCP

Prepare an offline explanation of agent-written code for a human. Raccoon is for
understanding a PR, not reviewing, editing or merging it.

The agent using the supplied skill writes explanations and code references. The
MCP server reads Git objects, validates references, copies real files, and builds
one complete artifact per PR. It does not call a model or require an AI API key.

The companion [web reader](https://github.com/bajor/raccoon-ios) imports local
artifacts on an iPad. No private source is uploaded to that reader's host.

## Development

Node.js 22+, npm and Git are required. GitHub operations additionally use `gh`.

```sh
npm ci
make test
```

## Agent commit discipline

Add instructions to your coding agent's `AGENTS.md` (and `CLAUDE.md` for Claude
Code) to make small, descriptive commits frequently, one completed logical change
per commit, with the reason for non-obvious decisions. Keep one cohesive
functionality per PR. Preserve these commits rather than squashing their history:
Raccoon uses it to explain how the mechanism evolved, including reversals.

## Docs index

[Documentation](docs/index.md) contains the ratified scope and contract.
Installation and generation commands will be documented with their implementation.
