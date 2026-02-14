---
name: using-vit
description: Operates the vit CLI for discovering, vetting, remixing, and shipping software capabilities. Use when working with beacons, caps, vetting, vouching, remixing, or shipping in a vit project.
---

# vit CLI

Social toolkit for personalized software.

## Quick start

```bash
make install         # install dependencies
vit setup            # initialize user-level vit configuration
vit login alice.bsky.social           # authenticate with Bluesky
```

## Subcommands

| Command | Purpose |
|---------|---------|
| `vit setup` | Check system prerequisites (git, bun) and guide to login |
| `vit login <handle>` | Browser-based ATProto OAuth, saves DID to vit.json |
| `vit adopt <beacon>` | Fork or clone a project (does not initialize .vit/) |
| `vit init` | Initialize .vit/ in the current repo and set beacon |
| `vit follow <handle>` | Add an account to this project's following list |
| `vit unfollow <handle>` | Remove an account from this project's following list |
| `vit following` | List accounts in this project's following list |
| `vit skim` | Read caps from followed accounts, filtered by beacon |
| `vit vet <ref>` | Review a cap by its three-word ref before trusting |
| `vit beacon <target>` | Probe a remote repo for its beacon |
| `vit doctor` | Verify vit environment and project configuration |
| `vit config [action]` | Read/write vit.json config (list, set, delete) |
| `vit firehose` | Listen to Jetstream for cap events |
| `vit ship <text>` | Publish a cap to your feed |

For full option details, see [README.md](../../README.md).

## Core workflow

Setup (one-time, human terminal):

```bash
vit setup             # check prerequisites, guide to login
vit login <handle>    # authenticate with Bluesky
```

Adopt a project (human terminal):

```bash
vit adopt <beacon>    # fork/clone the repo
```

Initialize (coding agent):

```bash
vit init              # set beacon from git remotes
```

Follow accounts (human or agent):

```bash
vit follow <handle>   # add to project following list
vit following         # list followed accounts
```

Discover and review caps:

```bash
vit skim              # agent reads caps (ref/title/description)
vit vet <ref>         # human reviews a cap by its three-word ref
vit vet <ref> --trust # mark as trusted after review
```

## Terminology

Key terms: **beacon** (canonical project identity), **cap** (atomic social capability object), **remix** (local derivative of a vetted cap), **provenance** (lineage chain via vetting, remixing or vouching, and shipping).

Key verbs: **init**, **adopt**, **follow**, **skim**, **vet**, **vouch**, **remix**, **ship**.

For complete definitions, see [VOCAB.md](../../docs/VOCAB.md).

## Configuration

- **`.vit/`** — local project directory, stores config.json (beacon) and local state (JSONL logs)
- **`.vit/following.json`** — project following list (committed, shared across contributors)
- **`vit.json`** — user config (`did`, `setup_at`, etc.), written by `vit login`, `vit setup`, and `vit config`
- **`session.json`** — OAuth session data managed by the ATProto client, written by `vit login`
- **`vit config`** — read/write `vit.json` user-level config
