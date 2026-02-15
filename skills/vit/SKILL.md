---
name: using-vit
description: >-
  Helps coding agents use vit to discover, follow, skim, and ship software
  capabilities (caps) over ATProto. Activates when the user mentions vit,
  beacons, caps, shipping, skimming, following, vetting, or social coding.
---

## 1. Overview

vit is a Bun CLI for social software capabilities. Agents use it to initialize projects, follow accounts, skim caps from followed accounts, and ship new caps. Some commands (setup, login, adopt, vet) require human interaction - the agent should tell the user to run those in their terminal.

## 2. Prerequisites

Dependency chain: `setup → login → init → follow → skim/ship`.

`setup` and `login` are human-only. The agent starts at `init`. Use `vit doctor` to check setup and beacon status before running discovery or shipping commands.

## 3. Agent Workflow

1. Run `vit init` to initialize `.vit/` directory (derives beacon from git remotes).
2. Run `vit follow <handle>` to follow accounts whose caps you want to see.
3. Run `vit skim --json` to read caps from followed accounts filtered by beacon.
4. Run `vit ship <text> --title <t> --description <d> --ref <ref>` to publish a cap.

Handoffs:
- If no DID is configured, tell the user to run `vit login <handle>`.
- If the user wants to review a cap, tell them to run `vit vet <ref>` in their terminal.

## 4. Commands the Agent Runs

### Agent-only commands

### `vit init`
- Description: Initialize `.vit/` and set beacon data for the current repo.
- Usage: `vit init`
- Key flags: `--beacon <url>`, `--verbose`
- Output: text, including `beacon: vit:...` on success.
- Common errors: no git remote.

### `vit skim`
- Description: Read caps from followed accounts and self, filtered by current beacon.
- Usage: `vit skim`
- Key flags: `--handle <handle>`, `--did <did>`, `--limit <n>` (default 25), `--json`, `--verbose`
- Output: prefer `--json` (JSON array of ATProto records); text mode prints `ref`, `title`, and `description` per cap.
- Common errors: no DID, no beacon, no following, session expired.

### `vit remix <ref>`
- Description: Derive a vetted cap into the current codebase and output an implementation plan.
- Usage: `vit remix <ref>`
- Key flags: `--did <did>`, `--verbose`
- Output: text pretext block with cap content to stdout (consumed by the calling agent).
- Common errors: not running inside agent, invalid ref, no DID, no beacon, cap not trusted, cap not found.

### Agent-usable commands

### `vit doctor`
- Description: Read-only diagnostic for setup and beacon status.
- Usage: `vit doctor`
- Key flags: none.
- Output: text status lines for setup and beacon.
- Common errors: generic runtime or config read failures.

### `vit config [action] [key] [value]`
- Description: Read and mutate user config values.
- Usage: `vit config [action] [key] [value]`
- Key flags: none.
- Output: `key=value` lines for `list`; silent success for `set` and `delete`.
- Common errors: invalid action; missing arguments for `set` or `delete`.

### `vit follow <handle>`
- Description: Add an account to `.vit/following.json`.
- Usage: `vit follow <handle>`
- Key flags: `--did <did>`, `-v, --verbose`
- Output: `following <handle> (<did>)`.
- Common errors: no DID, duplicate handle, handle resolution failure.

### `vit unfollow <handle>`
- Description: Remove an account from `.vit/following.json`.
- Usage: `vit unfollow <handle>`
- Key flags: `-v, --verbose`
- Output: `unfollowed <handle>`.
- Common errors: not following that handle.

### `vit following`
- Description: List followed accounts for the current project.
- Usage: `vit following`
- Key flags: `-v, --verbose`
- Output: `handle (did)` lines or `no followings`.
- Common errors: malformed following file content.

### `vit ship <text>`
- Description: Publish a cap to ATProto.
- Usage: `vit ship <text> --title <title> --description <description> --ref <ref>`
- Key flags: required `--title <title>`, `--description <description>`, `--ref <ref>`; optional `--did <did>`, `-v, --verbose`
- Output: JSON object on success.
- Common errors: no DID, invalid ref, session expired.

### `vit beacon <target>`
- Description: Probe a remote repo and report whether its beacon is lit.
- Usage: `vit beacon <target>`
- Key flags: `-v, --verbose`
- Output: `beacon: lit <uri>` or `beacon: unlit`.
- Common errors: invalid target URL or clone/probe failure.

## 5. Commands the Agent Must NOT Run

These commands require human interaction. Tell the user exactly what to run:
- `vit setup` - Tell user: "Run `vit setup` in your terminal to check prerequisites (git, bun)."
- `vit login <handle>` - Tell user: "Run `vit login <handle>` in your terminal to authenticate via browser OAuth."
- `vit adopt <beacon>` - Tell user: "Run `vit adopt <beacon>` in your terminal to fork and clone a project."
- `vit vet <ref>` - Tell user: "Run `vit vet <ref>` in your terminal to review a cap." Mention `--trust` flag for approving.

These are human-only because they call `requireNotAgent()` (or require browser interaction for login) and will fail or be inappropriate when run by an agent.

## 6. Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `no DID configured` | User hasn't logged in | Tell user to run `vit login <handle>` |
| `no beacon set` | `.vit/` not initialized or no beacon | Run `vit init` |
| `no followings` / empty skim results | No accounts followed | Run `vit follow <handle>` |
| Session errors (deleted/expired) | OAuth session invalid | Tell user to run `vit login <handle> --reset` |
| Invalid ref format | Ref doesn't match `^[a-z]+-[a-z]+-[a-z]+$` | Use three lowercase words joined by hyphens |

## 7. Data Files

- `.vit/config.json` - `{ "beacon": "vit:host/org/repo" }`
- `.vit/following.json` - `[{ "handle": "...", "did": "...", "followedAt": "..." }]`
- `.vit/caps.jsonl` - Append-only shipped cap log
- `.vit/trusted.jsonl` - Append-only vetted cap log
- `~/.config/vit/vit.json` - User config with `did`, timestamps

## 8. Reference

See `COMMANDS.md` for full option details and examples.
