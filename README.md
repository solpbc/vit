# vit

CLI toolkit for DID:PLC operations and Bluesky OAuth.

## Install

For development:

```bash
bun install
```

For global CLI use:

```bash
bun install -g .
```

## Terminology

- **beacon** — a git repo that uniquely represents a project for all vit users; all project groupings are based on a single beacon (one unified "upstream"); git urls are canonicalized into a uniform beacon; stored in `.vit/`
- **init** — check environment readiness and configure vit for first use; alias: `doctor`
- **adopt** — adopt an existing project by its beacon; forks or clones the repo
- **follow** — atproto handles; stored in local project `.vit/`
- **skim** — check follows + beacon for posts; read the feed
- **vet** — run local evaluation and generate evidence for a cap
- **vouch** — publicly endorse a vetted cap, optionally attaching evidence
- **remix** — mix a post with local codebase and create a plan to implement; auto-likes
- **ship** — take any locally implemented feature and write up a post (or quote post if was remixed)

## login

Log in to Bluesky via browser-based OAuth.

### Usage

```bash
vit login --handle alice.bsky.social
```

This will:
1. Start a temporary localhost callback server
2. Open your browser to the Bluesky authorization page
3. After you approve, print the DPoP-bound access token and DID
4. Save credentials (`did`, `access_token`, `refresh_token`, `expires_at`) to `vit.json`

### Options

- `--handle <handle>` - Bluesky handle (required)
- `-v, --verbose` - Show discovery and protocol details
- `--output <file>` - Save token JSON to a file

### Notes

The access token is DPoP-bound, meaning it requires a DPoP proof JWT for each API request. The token cannot be used as a simple Bearer token.

## plc-register

Generate and register a DID:PLC genesis operation.

### Usage

```bash
vit plc-register --help
```

### Options

- `--out <dir>` - Output directory for keys (default: `plc_keys`)
- `--curve <curve>` - Rotation key curve (`k256` or `p256`, default: `k256`)
- `--aka <uri>` - `alsoKnownAs` entry (may be repeated)
- `--pds <url>` - PDS endpoint URL
- `--dry-run` - Build and print but do not POST to PLC
- `-v, --verbose` - Show verbose output

## plc-verify

Verify your saved DID against the PLC directory.

### Usage

```bash
vit plc-verify
```

This reads `did` from `vit.json` and:
- Resolves the DID document via `https://plc.directory/{did}`
- Fetches the audit log
- Prints a summary of handles, services, verification methods, and operation history

### Options

- `--did <did>` - Check a specific DID (overrides config)
- `-v, --verbose` - Show full API responses

## firehose

Listen to Bluesky Jetstream for custom record events.

### Usage

```bash
vit firehose
```

### Options

- `--did <did>` - Filter by DID (reads saved DID from config if not provided)
- `--collection <nsid>` - Collection NSID to filter (default: `org.v-it.hello`)
- `-v, --verbose` - Show full JSON for each event

## pds-record

Write and read a custom `org.v-it.hello` record on the authenticated PDS.

### Usage

```bash
vit pds-record --message "hello world"
```

### Options

- `--did <did>` - DID to use (overrides config)
- `--message <msg>` - Message to write (default: `hello world`)
- `-v, --verbose` - Show full API responses
