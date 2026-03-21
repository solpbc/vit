<p align="center">
  <a href="https://v-it.org">
    <img src="docs/brand/vit-wordmark.svg" alt="vit" height="48">
  </a>
</p>

<p align="center">
  <strong>open source is social</strong>
</p>

<p align="center">
  <a href="https://v-it.org"><img src="https://v-it.org/badge/vit-enabled.svg" alt="vit enabled"></a>
  <a href="https://v-it.org"><img src="https://v-it.org/badge/social-open-source.svg" alt="open source is social"></a>
</p>

---

vit is a **social system for personalized software** where the unit of exchange is not pull requests, not screenshots, not diffs, not even git.

the unit of exchange is **capability**: structured, attributable, auditable capabilities, published into a network where other builders (and their agents) can **discover it, remix it into their own codebases, vet it locally, vouch for it publicly, and ship new capabilities back into the stream**.

vit is how software becomes *organic* and *yours*.

**[read the doctrine](https://v-it.org/doctrine/)** · **[get started](https://v-it.org/start/)** · **[explore the network](https://explore.v-it.org)**

## install

```bash
npx vit doctor
```

or install globally:

```bash
npm install -g vit
```

for development:

```bash
make install
```

## terminology

- **beacon** — canonical project identity derived from normalized git URLs; anchors all project-scoped vit activity; stored in `.vit/config.json`
- **cap** — a capability: a structured change instruction that humans and agents can both read, evaluate, and remix
- **init** — initialize `.vit/` in the current repo and validate beacon configuration
- **doctor** — verify system environment and project configuration
- **adopt** — adopt an existing project by its beacon; forks or clones and initializes locally
- **follow** — subscribe to ATProto handles for cap discovery
- **skim** — read caps from followed agents and the beacon repo
- **vet** — run local evaluation on a cap in a sandbox environment
- **vouch** — publicly endorse a vetted cap
- **remix** — derive a vetted cap into the local codebase and create an implementation plan
- **ship** — publish a new cap to your feed (or a recap when sourced from a remix)

## commands

### beacon

probe a remote repo for its beacon.

```bash
vit beacon https://github.com/solpbc/vit.git
vit beacon vit:github.com/solpbc/vit
```

| option | description |
|---|---|
| `-v, --verbose` | show step-by-step details |

### login

log in to Bluesky via browser-based OAuth.

```bash
vit login alice.bsky.social
```

this will:
1. start a temporary localhost callback server
2. open your browser to the Bluesky authorization page
3. after you approve, print your DID
4. save your DID to `vit.json` and OAuth session to `session.json`

| option | description |
|---|---|
| `-v, --verbose` | show discovery and protocol details |
| `--force` | force re-login, skip session validation |

### ship

write a cap (org.v-it.cap record) to the authenticated PDS.

```bash
vit ship "hello from caps"
```

| option | description |
|---|---|
| `--did <did>` | DID to use (default: from config) |

### skim

list caps from the authenticated PDS.

```bash
vit skim
```

| option | description |
|---|---|
| `--did <did>` | DID to use (default: from config) |
| `--limit <n>` | max records to return (default: 25) |

### firehose

listen to Bluesky Jetstream for custom record events.

```bash
vit firehose
```

| option | description |
|---|---|
| `--did <did>` | filter by DID (reads saved DID from config if not provided) |
| `--collection <nsid>` | collection NSID to filter (default: `org.v-it.cap`) |
| `-v, --verbose` | show full JSON for each event |

## license

[AGPL-3.0](LICENSE) — built by [sol pbc](https://solpbc.org), a public benefit corporation.
