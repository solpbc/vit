---
name: atproto-records
description: >-
  Teaches agents to read and write ATProto records using XRPC endpoints.
  Activates when working with AT Protocol repositories, collections, DIDs,
  or Bluesky/ATmosphere applications.
version: 0.1.0
license: AGPL-3.0-only
---

# ATProto Records

Use this skill when working with AT Protocol repositories, DID resolution,
record retrieval, or record writes.

## Data Model

ATProto stores data in per-account repositories.

Core concepts:

- Repo: the account's record store, typically identified by a DID
- Collection: a typed namespace such as `app.bsky.feed.post`
- Record: a document stored in a collection
- Rkey: the record key within the collection

A single record is identified by repo DID + collection + rkey.

## AT URIs

AT URIs use this format:

```text
at://did/collection/rkey
```

Example:

```text
at://did:plc:abc123/org.v-it.cap/3mhtkgpstnc2l
```

When code needs an HTTP URL for a record, it usually has to map the AT URI into
an XRPC request using those three parts.

## Collection Naming

Collections use reverse-DNS naming.

Examples:

- `org.v-it.cap`
- `org.v-it.skill`
- `com.atproto.repo.listRecords` is an XRPC method, not a collection

Keep collection names stable because they become part of the protocol surface.

## Key XRPC Endpoints

Common record endpoints:

- `com.atproto.repo.getRecord`
- `com.atproto.repo.listRecords`
- `com.atproto.repo.createRecord`
- `com.atproto.repo.putRecord`
- `com.atproto.repo.deleteRecord`

Typical read flow:

1. Resolve the repo DID to discover its PDS
2. Call the XRPC endpoint against that PDS
3. Pass repo DID, collection, and optional rkey or cursor parameters

Example `getRecord` query shape:

```text
/xrpc/com.atproto.repo.getRecord?repo=<did>&collection=<nsid>&rkey=<rkey>
```

Example `listRecords` query shape:

```text
/xrpc/com.atproto.repo.listRecords?repo=<did>&collection=<nsid>&limit=100
```

## DID Resolution

Two common DID methods:

### `did:plc`

Resolve through `https://plc.directory/<did>`.

Example:

```text
https://plc.directory/did:plc:abc123
```

### `did:web`

Resolve through the domain's DID document.

Root form:

```text
did:web:example.com
-> https://example.com/.well-known/did.json
```

Path form:

```text
did:web:example.com:team:app
-> https://example.com/team/app/did.json
```

## PDS Discovery

After fetching the DID document, inspect its `service` array and find the
ATProto PDS service endpoint.

In practice, the service entry is the one used for personal data server access.
Some codebases look for a fragment such as `#atproto_pds`; others match the
service type used by the document. Follow the repo's existing convention.

The result is the base URL for XRPC calls like `listRecords` and `getRecord`.

## Authentication

Reads against public data can often be anonymous, but writes require
authentication.

Typical app flow:

- User completes OAuth login
- App stores session credentials or tokens
- Client restores session before calling write endpoints
- Write requests include DPoP or other required proof material for the session

For agent-oriented tools, session restoration usually happens once near command
startup, then the authenticated client is reused for record writes.

## Pagination

`listRecords` supports cursor-based pagination.

Common parameters:

- `limit`: max records to return
- `cursor`: token for the next page

Typical loop:

1. Request the first page with `limit`
2. Read `records`
3. If `cursor` is present, request the next page with that cursor
4. Repeat until no cursor remains

Do not assume a single response contains the full collection.

## CIDs and Content Addressing

Records are content-addressed and often accompanied by a CID.

- CID identifies the exact content
- AT URI identifies the location in the repo
- Updating a record can keep the same AT URI while changing its CID

Use both when you need strong reference integrity, such as vouches or quoted
references to a specific record state.

## Write Operations

Choose the endpoint by intent:

- `createRecord` when creating a new record and letting the server generate or
  accept an rkey
- `putRecord` when writing to a known rkey
- `deleteRecord` when removing a record

Many codebases use generated TIDs for rkeys on append-only feeds.

## Example: Read Records From a PDS

```js
const pds = "https://bsky.social";
const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
url.searchParams.set("repo", "did:plc:abc123");
url.searchParams.set("collection", "org.v-it.cap");
url.searchParams.set("limit", "100");

const res = await fetch(url);
if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
const data = await res.json();
console.log(data.records);
```

If the response includes `cursor`, continue fetching until exhausted.

## Working Style

When editing ATProto code:

- Keep DID parsing and PDS discovery centralized
- Reuse shared helpers for record listing and URI handling
- Preserve collection names exactly
- Treat pagination and CID handling as protocol concerns, not optional details
