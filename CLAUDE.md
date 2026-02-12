# CLAUDE.md

Development guidelines for vit, a social toolkit for personalized software built with Bun.

## Project Overview

vit is a Bun CLI for discovering, vetting, remixing, and shipping software capabilities:
- `vit setup`, `vit login`, `vit init`, `vit doctor` — authentication and environment setup
- `vit beacon`, `vit config` — project beacon inspection and user configuration
- `vit firehose` — listen to Jetstream for cap events
- `vit ship`, `vit skim` — publish and read caps

Source layout:
- `bin/vit.js` - executable entrypoint
- `src/cli.js` - root Commander program
- `src/cmd/` - subcommand modules
- `src/lib/` - shared helpers

## Commands

```bash
make install    # Install dependencies with bun
make test       # Run tests with bun
make clean      # Remove node_modules
```

## Development Principles

- **Simple code** - Prefer plain functions. Keep scripts self-contained.
- **DRY, KISS** - Extract common logic, prefer simple solutions.
- **Fail fast** - Validate inputs and external state early. Clear error messages.

## Verification

- Always run `make test` before committing — all tests must pass.
- Hand-test affected CLI commands (`./bin/vit.js <command>`) to verify behavior beyond what tests cover.

## Hosting

The `docs/` directory is published to [v-it.org](https://v-it.org) via GitHub Pages. Pushing to main auto-deploys.

## File Headers

All JS source files must include this header immediately after the shebang line:

```
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
```

Add this header to `.js` files in `bin/` and `src/`. Do not add headers to docs/, node_modules/, or non-source files.

## Skills

Agent skills for this project live in `skills/`. When authoring or updating skills, follow the [Claude agent skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):

- Keep SKILL.md concise — under 500 lines. Only add context Claude doesn't already have.
- Use progressive disclosure: essentials inline, details in referenced files one level deep.
- Use gerund or action-oriented naming (lowercase-hyphens only) for skill names.
- Write descriptions in third person that specify both what the skill does and when to use it.
- Test with all target models (Haiku, Sonnet, Opus) as effectiveness varies.
