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

### Options

- `--handle <handle>` — Bluesky handle (required)
- `-v, --verbose` — Show discovery and protocol details
- `--output <file>` — Save token JSON to a file

### Notes

The access token is DPoP-bound, meaning it requires a DPoP proof JWT for each API request. The token cannot be used as a simple Bearer token. Token refresh is not implemented in this version.
