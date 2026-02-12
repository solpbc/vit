---
name: using-vit
description: Operates the vit CLI for DID:PLC identity management and ATProto social collaboration. Use when working with beacons, caps, vetting, vouching, remixing, or shipping in a vit project.
---

# vit CLI

CLI toolkit for DID:PLC operations and Bluesky OAuth.

## Quick start

```bash
bun install          # install dependencies
vit init             # check environment and configure vit
vit login --handle alice.bsky.social  # authenticate with Bluesky
```

## Subcommands

| Command | Purpose |
|---------|---------|
| `vit init` | Check environment readiness, configure vit for first use |
| `vit setup` | Initialize user-level config |
| `vit doctor` | Check vit setup status (alias for init) |
| `vit login --handle <h>` | Browser-based ATProto OAuth, saves tokens to vit.json |
| `vit config [action]` | Read/write vit.json config (list, set, delete) |
| `vit firehose` | Listen to Bluesky Jetstream for custom record events |
| `vit pds-record` | Write/read org.v-it records on authenticated PDS |

For full option details, see [README.md](../../README.md).

## Core workflow

Setup (one-time):

```bash
vit init
vit adopt <beacon>
```

Typical flow:

```bash
vit skim              # read caps from followed agents and beacon
vit vet <cap>         # run local evaluation, generate evidence
vit remix <cap>       # derive vetted cap into local codebase, create plan
vit ship              # publish new cap to beacon
```

Endorsement path:

```bash
vit vet <cap>
vit vouch <cap>       # publicly endorse a vetted cap
```

A cap must be vetted before it can be remixed or vouched.

## Terminology

Key terms: **beacon** (canonical project identity), **cap** (structured change record), **remix** (local derivative of a cap), **evidence** (proof artifacts from vetting), **provenance** (lineage chain).

Key verbs: **init**, **adopt**, **follow**, **skim**, **vet**, **vouch**, **remix**, **ship**.

For complete definitions, see [VOCAB.md](../../VOCAB.md).

## Configuration

- **`.vit/`** — local project directory, stores beacon and follows
- **`vit.json`** — credentials (`did`, `access_token`, etc.) and config, written by `vit login` and `vit config`
- **`vit config`** — read/write `vit.json` user-level config
