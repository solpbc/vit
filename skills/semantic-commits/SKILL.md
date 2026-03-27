---
name: semantic-commits
description: >-
  Teaches agents to write structured commit messages using conventional commit
  types (feat, fix, docs, test, refactor, perf, chore, style). Activates when
  committing code changes or writing commit messages.
version: 0.1.0
license: AGPL-3.0-only
---

# Semantic Commits

Use conventional commits so history stays searchable, releasable, and easy to
scan.

## Format

Default form:

```text
type: subject
```

Optional scoped form:

```text
type(scope): subject
```

Use a scope only when it adds useful precision, such as a package, command, or
subsystem.

Examples:

```text
feat: add skill publishing command
fix(scan): handle empty cursor responses
docs(api): clarify AT URI examples
```

## Types

### `feat`

Use for a user-visible capability or meaningful enhancement.

Examples:

```text
feat: add skill discovery filters
feat(explore): show recent network activity
```

### `fix`

Use for a defect correction or behavior regression.

Examples:

```text
fix: preserve beacon when shipping recap
fix(vet): reject malformed skill refs
```

### `docs`

Use for documentation-only changes.

Examples:

```text
docs: add dogfooding guidance
docs(start): explain who to follow first
```

### `test`

Use for adding or improving tests without changing production behavior.

Examples:

```text
test: cover did:web path resolution
test(ship): verify skill frontmatter validation
```

### `refactor`

Use for internal restructuring that keeps behavior the same.

Examples:

```text
refactor: extract record pagination helper
refactor(remix): simplify trust gate flow
```

### `perf`

Use for measurable performance improvements.

Examples:

```text
perf: batch DID queries with bounded concurrency
perf(explore): reduce duplicate API requests
```

### `chore`

Use for maintenance work that does not fit the other categories.

Examples:

```text
chore: update lockfile
chore(ci): pin bun version
```

### `style`

Use for formatting or stylistic cleanup with no behavioral impact.

Examples:

```text
style: normalize markdown spacing
style(explore): align inline script indentation
```

## Subject Rules

- Write the subject in imperative mood: "add", "fix", "remove", not "added"
- Keep it lowercase unless a proper noun requires capitalization
- Do not end with a period
- Keep it under 72 characters
- Focus on the main change, not every touched file

Good:

```text
fix: handle missing did document service
```

Bad:

```text
Fix: Handled missing DID document service.
```

## Body Guidelines

Add a body when context helps reviewers or future readers.

- Explain why the change was needed
- Explain constraints, side effects, or tradeoffs
- Avoid narrating obvious code mechanics line by line
- Wrap body lines at 72 characters when practical

Example:

```text
refactor: isolate PDS record scanning

The remix, vet, and vouch commands all repeated the same network scan
pattern. Centralizing the loop keeps selection logic consistent and
makes follow-up pagination changes safer.
```

## Breaking Changes

Mark breaking changes in one of two ways:

```text
feat!: rename ship --tag to --tags
```

Or with a footer:

```text
refactor(api): normalize record payloads

BREAKING CHANGE: listRecords callers must now read data.records
instead of records directly.
```

Use both when the break should be impossible to miss.

## Anti-Patterns

Avoid:

- Vague subjects like `update code`, `fix stuff`, `misc changes`
- Mixing unrelated changes under one type when the work should be split
- Using `chore` or `refactor` to hide a real feature or bug fix
- Over-scoping every commit when the scope adds no value
- Writing subjects as status reports, such as `work on login flow`

Weak:

```text
chore: update code
```

Better:

```text
fix(login): refresh expired session before API calls
```

## Quick Checklist

Before finalizing a commit message, confirm:

- The type matches the user-visible intent of the change
- The subject is imperative, lowercase, and under 72 chars
- The body explains why when needed
- Breaking changes are marked clearly
