---
name: semantic-commits
version: "1.0.0"
description: >-
  Guides agents to write conventional commit messages with correct types, scopes,
  and formatting. Activates when committing code or writing commit messages.
---

## 1. Format

```
<type>(<scope>): <subject>

<body>
```

- **subject**: imperative mood, lowercase, no period, under 72 characters
- **scope**: optional, names the area changed (e.g. `cli`, `auth`, `explorer`)
- **body**: optional, explains *why* not *what*, wrapped at 72 characters

## 2. Types

| Type | When to use |
|------|------------|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `test` | Adding or updating tests only |
| `docs` | Documentation changes only |
| `refactor` | Code restructuring with no behavior change |
| `chore` | Maintenance — deps, CI, tooling, config |
| `perf` | Performance improvement with no behavior change |
| `style` | Formatting, whitespace, linting — no logic change |

## 3. Scope

Use the most specific component name that applies:

- CLI commands: `cli`, `ship`, `skim`, `scan`, `follow`
- Libraries: `auth`, `pds`, `lexicon`, `brand`
- Infrastructure: `ci`, `deps`, `build`
- Documentation: `docs`, `readme`, `skill`

Omit scope if the change spans multiple areas.

## 4. Examples

```
feat(scan): add tag filtering for skill discovery
fix(auth): handle expired OAuth sessions gracefully
test(ship): add validation tests for --kind flag
docs(skill): document vit scan flags and output format
refactor(pds): extract DID resolution into shared helper
chore(deps): update bun to 1.3.10
perf(skim): batch PDS queries for followed accounts
style(cli): normalize whitespace in help output
```

## 5. Breaking Changes

Add `!` after type/scope and a `BREAKING CHANGE:` footer:

```
feat(auth)!: require OAuth for all PDS operations

BREAKING CHANGE: Basic auth is no longer supported. Users must run
`vit login <handle>` to authenticate via OAuth.
```

## 6. Multi-line Bodies

When the *why* matters, use the body:

```
fix(skim): deduplicate caps from multi-PDS resolution

The handle-to-DID resolution could return records from both the
primary and mirror PDS, causing duplicate caps in skim output.
Filter by URI uniqueness before display.
```
