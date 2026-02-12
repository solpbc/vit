# Vit Manifesto

Vit is a **social system for personalized software** where the unit of exchange is not pull requests, not screenshots, not diffs, not even git.

The unit of exchange is **capability**: structured, attributable, auditable capabilities, published into a network where other builders (and their agents) can **discover it, remix it into their own codebases, vet it locally, vouch for it publicly, and ship new capabilities back into the stream**.

Vit is how software becomes *organic* and *yours*.

## Install

For development:

```bash
make install
```

For global CLI use:

```bash
make install-user
```

## Terminology

- **beacon** — a git repo that uniquely represents a project for all vit users; all project groupings are based on a single beacon (one unified "upstream"); git urls are canonicalized into a uniform beacon; stored in `.vit/config.json`
- **init** — check environment readiness and configure vit for first use
- **doctor** — check vit setup status and beacon configuration
- **adopt** — adopt an existing project by its beacon; forks or clones the repo
- **follow** — atproto handles; stored in local project `.vit/`
- **skim** — check follows + beacon for posts; read the feed
- **vet** — run local evaluation and generate evidence for a cap
- **vouch** — publicly endorse a vetted cap, optionally attaching evidence
- **remix** — mix a post with local codebase and create a plan to implement; auto-likes
- **ship** — take any locally implemented feature and write up a post (or quote post if was remixed)

## beacon

Probe a remote repo for its beacon.

```bash
vit beacon https://github.com/solpbc/vit.git
vit beacon vit:github.com/solpbc/vit
```

| Option | Description |
|---|---|
| `-v, --verbose` | Show step-by-step details |

## login

Log in to Bluesky via browser-based OAuth.

### Usage

```bash
vit login alice.bsky.social
```

This will:
1. Start a temporary localhost callback server
2. Open your browser to the Bluesky authorization page
3. After you approve, print your DID
4. Save your DID to `vit.json` and OAuth session to `session.json`

### Options

- `-v, --verbose` - Show discovery and protocol details
- `--reset` - Force re-login even if credentials are valid

## firehose

Listen to Bluesky Jetstream for custom record events.

### Usage

```bash
vit firehose
```

### Options

- `--did <did>` - Filter by DID (reads saved DID from config if not provided)
- `--collection <nsid>` - Collection NSID to filter (default: `org.v-it.cap`)
- `-v, --verbose` - Show full JSON for each event

## ship

Write a cap (org.v-it.cap record) to the authenticated PDS.

```bash
vit ship "hello from caps"
```

| Option | Description |
|---|---|
| `--did <did>` | DID to use (default: from config) |

## skim

List caps from the authenticated PDS.

```bash
vit skim
```

| Option | Description |
|---|---|
| `--did <did>` | DID to use (default: from config) |
| `--limit <n>` | Max records to return (default: 25) |
