# architecture

## record types

vit uses ATProto records stored in each user's PDS repository. three record types are used:

| record type | NSID | custom? | key | purpose |
|---|---|---|---|---|
| cap | `org.v-it.cap` | yes | `tid` | structured change description |
| like | `app.bsky.feed.like` | no (reused) | `tid` | endorse a cap |
| follow | `app.bsky.graph.follow` | no (reused) | `tid` | subscribe to a handle |

### why caps use a custom NSID

caps are structurally similar to Bluesky posts (`app.bsky.feed.post`) but serve a different purpose. using a custom NSID (`org.v-it.cap`) ensures:

- caps live in their own collection (`org.v-it.cap`) and never appear in a user's Bluesky post feed.
- Bluesky AppViews and feed generators ignore cap records (unknown collection).
- vit tooling can query caps independently without filtering out posts.
- the cap schema can evolve independently of `app.bsky.feed.post`.

### why likes and follows are reused

`app.bsky.feed.like` and `app.bsky.graph.follow` are generic enough to use as-is:

- a like's `subject` is a `strongRef` (URI + CID) — it works for any record, including caps.
- a follow's `subject` is a DID — it works regardless of what record types the followed account publishes.
- reusing official lexicons means likes and follows are visible in Bluesky clients, which is acceptable and useful for cross-network discoverability.

## cap lexicon

the cap lexicon (`lexicons/org/v-it/cap.json`) mirrors `app.bsky.feed.post` with these differences:

- **NSID**: `org.v-it.cap` instead of `app.bsky.feed.post`.
- **deprecated fields removed**: `entities` and `textSlice` are not carried over.
- **self-referencing replies**: `reply` references `org.v-it.cap#replyRef`, so cap threads are self-contained.
- **descriptions updated**: all description strings reference "cap" instead of "post".

fields carried over from `app.bsky.feed.post` and their cap-context meaning:

| field | type | cap meaning |
|---|---|---|
| `text` | string (max 3000 bytes / 300 graphemes) | primary cap content |
| `facets` | array of `app.bsky.richtext.facet` | rich text annotations (mentions, URLs, hashtags) |
| `reply` | `org.v-it.cap#replyRef` | thread structure (parent + root refs) |
| `embed` | union of `app.bsky.embed.*` | attached media, links, or record embeds |
| `langs` | array of language strings (max 3) | content language hints |
| `labels` | `com.atproto.label.defs#selfLabels` | content warnings |
| `tags` | array of strings (max 8) | additional hashtags |
| `beacon` | string (max 512 bytes) | beacon URI scoping this cap to a project |
| `createdAt` | datetime | client-declared creation timestamp |

### relationship to VOCAB.md

VOCAB.md defines a cap as a markdown document containing free-form instructions for implementing a change — with sections for intent, scope, risk, implementation guide, and other context. the current lexicon mirrors `app.bsky.feed.post`, so most cap semantics are encoded in `text`, `tags`, threading, and embeds. `beacon` is a dedicated structured field for project scoping.

## directory layout

lexicon JSON files follow the NSID-to-path convention:

```
lexicons/
  org/
    v-it/
      cap.json          # org.v-it.cap
```

this mirrors the convention used in the ATProto repository.

## future work

- custom lexicons for vouch (`org.v-it.vouch`) and other vit interaction record types.
- provenance tracking across vet, remix, vouch, and ship lineage.
- runtime lexicon validation (currently `validate: false` in CLI write commands).
