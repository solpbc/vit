# Architecture

## Record Types

vit uses ATProto records stored in each user's PDS repository. Three record types are used:

| Record type | NSID | Custom? | Key | Purpose |
|---|---|---|---|---|
| Cap | `org.v-it.cap` | Yes | `tid` | Structured change description |
| Like | `app.bsky.feed.like` | No (reused) | `tid` | Endorse a cap |
| Follow | `app.bsky.graph.follow` | No (reused) | `tid` | Subscribe to a handle |

### Why caps use a custom NSID

Caps are structurally similar to Bluesky posts (`app.bsky.feed.post`) but serve a different purpose. Using a custom NSID (`org.v-it.cap`) ensures:

- Caps live in their own collection (`org.v-it.cap`) and never appear in a user's Bluesky post feed.
- Bluesky AppViews and feed generators ignore cap records (unknown collection).
- vit tooling can query caps independently without filtering out posts.
- The cap schema can evolve independently of `app.bsky.feed.post`.

### Why likes and follows are reused

`app.bsky.feed.like` and `app.bsky.graph.follow` are generic enough to use as-is:

- A like's `subject` is a `strongRef` (URI + CID) — it works for any record, including caps.
- A follow's `subject` is a DID — it works regardless of what record types the followed account publishes.
- Reusing official lexicons means likes and follows are visible in Bluesky clients, which is acceptable and useful for cross-network discoverability.

## Cap Lexicon

The cap lexicon (`lexicons/org/v-it/cap.json`) mirrors `app.bsky.feed.post` with these differences:

- **NSID**: `org.v-it.cap` instead of `app.bsky.feed.post`.
- **Deprecated fields removed**: `entities` and `textSlice` are not carried over.
- **Self-referencing replies**: `reply` references `org.v-it.cap#replyRef`, so cap threads are self-contained.
- **Descriptions updated**: All description strings reference "cap" instead of "post".

Fields carried over from `app.bsky.feed.post` and their cap-context meaning:

| Field | Type | Cap meaning |
|---|---|---|
| `text` | string (max 3000 bytes / 300 graphemes) | Primary cap content |
| `facets` | array of `app.bsky.richtext.facet` | Rich text annotations (mentions, URLs, hashtags) |
| `reply` | `org.v-it.cap#replyRef` | Thread structure (parent + root refs) |
| `embed` | union of `app.bsky.embed.*` | Attached media, links, or record embeds |
| `langs` | array of language strings (max 3) | Content language hints |
| `labels` | `com.atproto.label.defs#selfLabels` | Content warnings |
| `tags` | array of strings (max 8) | Additional hashtags |
| `createdAt` | datetime | Client-declared creation timestamp |

### Relationship to VOCAB.md

VOCAB.md defines a cap as a markdown document containing free-form instructions for implementing a change — with sections for intent, scope, risk, implementation guide, and other context. The current lexicon mirrors `app.bsky.feed.post`, so cap semantics are encoded in `text`, `tags`, threading, and embeds rather than dedicated structured fields.

## Directory Layout

Lexicon JSON files follow the NSID-to-path convention:

```
lexicons/
  org/
    v-it/
      cap.json          # org.v-it.cap
```

This mirrors the convention used in the atproto repository.

## Future Work

- Custom lexicons for vouch (`org.v-it.vouch`) and other vit interaction record types.
- Provenance tracking across vet, remix, vouch, and ship lineage.
- Runtime lexicon validation (currently `validate: false` in CLI write commands).
