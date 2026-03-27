---
name: bun-project
version: "1.0.0"
description: >-
  Guides agents through Bun project setup, testing, and APIs. Activates when
  working with Bun-based JavaScript/TypeScript projects.
---

## 1. Project Setup

Initialize a new project:

```bash
bun init                    # interactive setup
bun init -y                 # accept defaults
```

Key files:
- `package.json` — standard npm-compatible manifest
- `bun.lock` — binary lockfile (commit it, never edit manually)
- `bunfig.toml` — optional Bun-specific config

Install dependencies:

```bash
bun install                 # install from package.json
bun add <pkg>               # add a dependency
bun add -d <pkg>            # add a dev dependency
bun remove <pkg>            # remove a dependency
```

## 2. Running and Executing

```bash
bun run <script>            # run a package.json script
bun <file.js>               # run a JS/TS file directly
bunx <pkg>                  # execute a package binary (like npx)
```

Bun runs TypeScript and JSX natively — no build step needed.

## 3. Testing

Bun has a built-in test runner compatible with Jest-like syntax:

```javascript
import { test, expect, describe, beforeEach } from 'bun:test';

describe('example', () => {
  test('adds numbers', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run tests:

```bash
bun test                    # run all test files
bun test path/to/file       # run specific test file
bun test --watch            # re-run on file changes
```

Test file patterns: `*.test.{js,ts,jsx,tsx}`, `*_test.{js,ts}`, or files in `__tests__/`.

## 4. Bun-Specific APIs

### File I/O

```javascript
const file = Bun.file('path/to/file.txt');
const text = await file.text();          // read as string
const json = await file.json();          // parse as JSON
const bytes = await file.arrayBuffer();  // read as bytes
await Bun.write('out.txt', 'content');   // write a file
```

### HTTP Server

```javascript
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('ok');
    return new Response('not found', { status: 404 });
  },
});
```

### Hashing and Utilities

```javascript
const hash = Bun.hash('input string');
const pw = await Bun.password.hash('secret');
const ok = await Bun.password.verify('secret', pw);
```

### Shell

```javascript
import { $ } from 'bun';
const result = await $`ls -la`.text();
```

## 5. Workspaces

For monorepos, add to `package.json`:

```json
{
  "workspaces": ["packages/*"]
}
```

Each workspace package gets its own `package.json`. Run scripts in a specific workspace:

```bash
bun run --filter <name> <script>
```

## 6. Common Patterns

- **Shebangs**: Use `#!/usr/bin/env bun` for executable scripts
- **Environment variables**: Access via `Bun.env.VAR_NAME` or `process.env.VAR_NAME`
- **Import from URL**: `import x from 'https://example.com/mod.js'` works directly
- **SQLite**: `import { Database } from 'bun:sqlite'` — built-in, no install needed
