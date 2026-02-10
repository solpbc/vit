# CLAUDE.md

Development guidelines for vit, a Bun/JS toolkit for DID:PLC operations and Bluesky OAuth.

## Project Overview

vit is a minimal set of CLI tools: a DID:PLC genesis op generator + registrar (`plc_register.js`), a PLC directory verifier (`plc_test.js`), and a Bluesky OAuth CLI tool (`bsky_oauth.js`). All tools run on Bun.

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

## Hosting

The `docs/` directory is published to [v-it.org](https://v-it.org) via GitHub Pages. Pushing to main auto-deploys.

## File Headers

All JS source files must include this header immediately after the shebang line:

```
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
```

Add this header to `.js` files at the repo root. Do not add headers to docs/, node_modules/, or non-source files.
