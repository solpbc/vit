# vit

Minimal DID:PLC genesis op generator + registrar, and Bluesky OAuth CLI tool.

## PLC Register

Generate and register a DID:PLC genesis operation:

```
bun install
bun plc_register.js --help
```

## Bluesky OAuth

Obtain an ATProto OAuth access token via browser-based authorization.

### Usage

```
bun install
bun bsky_oauth.js --handle alice.bsky.social
```

This will:
1. Start a temporary localhost callback server
2. Open your browser to the Bluesky authorization page
3. After you approve, print the DPoP-bound access token and DID
4. Save credentials (`BSKY_DID`, `BSKY_ACCESS_TOKEN`, `BSKY_REFRESH_TOKEN`, `BSKY_EXPIRES_AT`) to `.env`

If `.env` already exists, only the `BSKY_*` variables are updated — other variables are preserved.

### Options

- `--handle <handle>` — Bluesky handle (required)
- `-v, --verbose` — Show discovery and protocol details
- `--output <file>` — Save token JSON to a file

### Notes

The access token is DPoP-bound, meaning it requires a DPoP proof JWT for each API request. The token cannot be used as a simple Bearer token. Token refresh is not implemented in this version.

## PLC Test

Verify your saved DID against the PLC directory:

```
bun plc_test.js
```

This reads `BSKY_DID` from `.env` and:
- Resolves the DID document via `https://plc.directory/{did}`
- Fetches the audit log
- Prints a summary of handles, services, verification methods, and operation history

### Options

- `--did <did>` — Check a specific DID (overrides `.env`)
- `-v, --verbose` — Show full API responses
