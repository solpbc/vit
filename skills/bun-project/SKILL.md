---
name: bun-project
description: >-
  Guides agents through Bun project setup, testing, and conventions. Activates
  when working in JavaScript/TypeScript projects that use Bun as their runtime
  and package manager.
version: 0.1.0
license: AGPL-3.0-only
---

# Bun Project

Use this skill when a project runs on Bun or expects Bun-native tooling.

## What Bun Covers

Bun can act as:

- Runtime for JavaScript and TypeScript
- Package manager
- Test runner
- Bundler

That means many projects can standardize on Bun commands instead of mixing
`node`, `npm`, Jest, and separate bundlers.

## Core Commands

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Run a package script or entrypoint:

```bash
bun run dev
bun run src/index.ts
```

Use `bun run <script>` for scripts defined in `package.json`, and `bun run
<file>` for direct file execution.

## `bunfig.toml`

`bunfig.toml` is Bun's project configuration file. Use it to define defaults
that should not be repeated in every command.

Common uses:

- Test configuration
- Install behavior
- JSX or transpiler-related defaults
- Runtime flags for local development

Check whether the repo already has `bunfig.toml` before introducing one. Keep
configuration minimal and aligned with existing `package.json` scripts.

## `bun:test`

Bun ships a built-in test API via `bun:test`.

Common imports:

```ts
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
```

Use:

- `describe` to group related tests
- `test` for individual cases
- `expect` for assertions
- `beforeEach` and `afterEach` for setup and cleanup
- `mock` for spies, stubs, and controlled replacements

Example:

```ts
import { describe, test, expect, beforeEach, mock } from "bun:test";

describe("config loader", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("reads defaults", () => {
    expect(true).toBe(true);
  });
});
```

Follow the local test style. If the repo already uses plain functions and
minimal fixtures, do not introduce heavier abstractions.

## Native Bun APIs

Prefer Bun-native APIs when the project already depends on Bun behavior.

### `Bun.file()`

Use for efficient file reads and metadata.

```ts
const file = Bun.file("README.md");
const text = await file.text();
```

### `Bun.write()`

Use for simple file writes.

```ts
await Bun.write("out.txt", "hello");
```

### `Bun.serve()`

Use for HTTP servers when the project is Bun-native.

```ts
Bun.serve({
  port: 3000,
  fetch() {
    return new Response("ok");
  },
});
```

If the repo already uses another server abstraction, preserve it unless the
change explicitly calls for Bun-native serving.

## Module Resolution

Bun is ESM-first. Prefer standard ESM imports and explicit file paths that match
repo conventions.

- Check `package.json` for `"type": "module"`
- Respect `exports` when consuming a package
- Avoid relying on legacy CommonJS patterns unless the repo already does
- Keep relative imports explicit and consistent

When publishing packages, ensure `package.json` `exports` reflects the supported
entrypoints instead of depending on deep imports.

## Performance Guidance

Bun is fast when you avoid unnecessary compatibility layers.

- Prefer native Bun APIs over extra wrappers when they simplify the code
- Avoid adding transpilation steps that Bun already handles
- Reuse Bun's built-in test runner instead of introducing another test stack
- Keep startup paths simple for CLIs and small services

Do not add Bun-specific code if the repository is intentionally runtime-agnostic.

## Common Project Patterns

Typical `package.json` scripts:

```json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "build": "bun build src/index.ts --outdir dist"
  }
}
```

For workspaces:

- Define workspaces in the root `package.json`
- Run `bun install` at the workspace root
- Keep shared tooling in root scripts when that matches the repo's structure

## Working Style

When editing a Bun project:

- Use existing `make`, `package.json`, or repo scripts first
- Run the smallest relevant Bun test target during iteration
- Run the repo's required final verification before handing work back
- Match established import style and file layout
