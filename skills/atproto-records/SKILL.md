---
name: atproto-records
version: "1.0.0"
description: >-
  Guides agents through reading and writing ATProto records, DID resolution,
  and PDS discovery. Activates when working with AT Protocol, Bluesky, or
  decentralized identity.
---

## 1. Core Concepts

- **DID**: Decentralized identifier (e.g. `did:plc:abc123`). The stable identity.
- **Handle**: Human-readable name (e.g. `alice.bsky.social`). Resolves to a DID.
- **PDS**: Personal Data Server — stores a user's records.
- **AT URI**: `at://did/collection/rkey` — uniquely identifies a record.
- **Lexicon**: Schema definition for record types (like a protobuf for ATProto).
- **NSID**: Namespaced identifier for collections (e.g. `app.bsky.feed.post`).

## 2. DID Resolution

### did:plc (most common)

```bash
curl https://plc.directory/did:plc:abc123
```

Response includes `service` entries — find the one with `#atproto_pds` to get the PDS URL:

```json
{
  "id": "did:plc:abc123",
  "service": [
    { "id": "#atproto_pds", "type": "AtprotoPersonalDataServer", "serviceEndpoint": "https://pds.example.com" }
  ]
}
```

### did:web

Resolve by fetching `https://<domain>/.well-known/did.json`.

### Handle to DID

```bash
curl https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=alice.bsky.social
```

## 3. Reading Records

### Get a Single Record

```
GET /xrpc/com.atproto.repo.getRecord?repo=<did>&collection=<nsid>&rkey=<rkey>
```

```bash
curl "https://pds.example.com/xrpc/com.atproto.repo.getRecord?repo=did:plc:abc123&collection=app.bsky.feed.post&rkey=3abc123"
```

Response:

```json
{
  "uri": "at://did:plc:abc123/app.bsky.feed.post/3abc123",
  "cid": "bafyrei...",
  "value": { "$type": "app.bsky.feed.post", "text": "hello", "createdAt": "..." }
}
```

### List Records

```
GET /xrpc/com.atproto.repo.listRecords?repo=<did>&collection=<nsid>&limit=<n>
```

Supports cursor-based pagination via `cursor` parameter.

### Browsing Records

Use [pdsls.dev](https://pdsls.dev) to browse any AT URI visually:

```
https://pdsls.dev/at/did:plc:abc123/app.bsky.feed.post/3abc123
```

Strip the `at://` prefix from the AT URI and append the rest as a path.

## 4. Writing Records

Authenticated requests require an access token from `com.atproto.server.createSession`.

### Create a Record

```
POST /xrpc/com.atproto.repo.createRecord
```

```json
{
  "repo": "did:plc:abc123",
  "collection": "org.v-it.cap",
  "record": {
    "$type": "org.v-it.cap",
    "title": "Example Cap",
    "description": "What it does",
    "ref": "example-cap-ref",
    "beacon": "vit:github.com/org/repo",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Put a Record (upsert)

```
POST /xrpc/com.atproto.repo.putRecord
```

Same as create, but includes `rkey` and optionally `swapRecord` (CID) for conflict detection.

### Delete a Record

```
POST /xrpc/com.atproto.repo.deleteRecord
```

```json
{
  "repo": "did:plc:abc123",
  "collection": "org.v-it.cap",
  "rkey": "abc123"
}
```

## 5. Lexicon System

Lexicons define record schemas using JSON:

```json
{
  "lexicon": 1,
  "id": "org.v-it.cap",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "ref", "beacon", "createdAt"],
        "properties": {
          "title": { "type": "string", "maxLength": 256 },
          "ref": { "type": "string" },
          "beacon": { "type": "string" },
          "description": { "type": "string", "maxLength": 1024 },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

NSIDs follow reverse-domain naming: `org.v-it.cap`, `app.bsky.feed.post`.

## 6. Jetstream

Jetstream provides real-time event streaming over WebSocket:

```
wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=org.v-it.cap
```

Parameters:
- `wantedCollections`: filter by collection NSID (repeatable)
- `cursor`: microsecond timestamp to replay from

Events are JSON with `kind` (`commit`, `identity`, `account`), `did`, and `commit` details.
