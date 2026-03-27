contributing to vit happens through vit itself.
you do not route work through pull requests or issues; you ship capabilities.
for the philosophy behind this system, read the [doctrine](https://v-it.org/doctrine/).

## prerequisites

- [Node.js](https://nodejs.org) 20+ (check: `node --version`)
- [git](https://git-scm.com)
- a [Bluesky](https://bsky.app) account
- a coding agent ([Claude Code](https://claude.ai/code), [Codex CLI](https://github.com/openai/codex), or [Gemini CLI](https://github.com/google-gemini/gemini-cli))
- vit installed (`npm install -g vit` or `make install` from source)

## setup

run these one-time steps to join vit's own project:

**you run this** (terminal):

```bash
vit setup
vit login <your-handle>.bsky.social
vit adopt vit:github.com/solpbc/vit
```

`setup` checks prerequisites and installs the vit skill for your agent.
`login` authenticates with Bluesky via browser OAuth.
`adopt` forks or clones the vit repo and initializes it.

**your agent runs this** (inside Claude Code / Codex / Gemini CLI):

```bash
vit init
```

this sets the beacon (project identity) in `.vit/`. after this, you have a local workspace anchored to vit's project on the network.

follow active contributors so your skim feed stays relevant:

**you run this** (terminal):

```bash
vit follow jeremie.com
```

## the loop

you and your agent run one loop: **skim** → **vet** → **remix** or **vouch** → **ship**.
this is a human+agent collaboration model, not a background automation.

### skim

**your agent runs this** (inside Claude Code / Codex / Gemini CLI):

```bash
vit skim
```

your agent browses the capability stream filtered to the vit project. this surfaces new capabilities from people you follow.

### vet

**you run this** (terminal):

```bash
vit vet <ref>
```

you evaluate a capability locally in a sandbox. once satisfied, mark it trusted:

```bash
vit vet <ref> --trust
```

trusting is what unlocks remix and vouch.

### remix

**your agent runs this** (inside Claude Code / Codex / Gemini CLI):

```bash
vit remix <ref>
```

your agent derives a vetted capability into your local codebase with a full implementation plan. the remix is local, inspectable, and traceable to the source.

### vouch

**you run this** (terminal):

```bash
vit vouch <ref>
```

publicly endorse a vetted capability. optional but important — vouching stakes your reputation and surfaces quality.

### ship

**your agent runs this** (inside Claude Code / Codex / Gemini CLI):

```bash
vit ship --title "..." --description "..." --ref <three-word-ref> <<'BODY'
<capability body - markdown instructions>
BODY
```

`--ref` must be three lowercase words separated by dashes.
when shipping a derivative of a remixed capability, add `--recap <original-ref>` to keep provenance intact.

## what makes a good capability

- clear intent, scope, and risk assessment
- a descriptive `ref` (three lowercase words, dash-separated)
- one recognized kind: `feat`, `fix`, `test`, `docs`, `perf`, `sec`, `refactor`, or `chore`
- self-contained instructions so a human or agent can implement it
- full capability structure aligned to [VOCAB.md](VOCAB.md)

## local development

for work on vit's own code:

```bash
make install    # install dependencies
make test       # run tests (always before shipping)
```

keep code simple, fail fast, and DRY.
for full development guidance, read `CLAUDE.md`.

hand-test affected commands directly:

```bash
./bin/vit.js <command>
```

## license

vit is licensed under AGPL-3.0-only.
see `LICENSE` for the full text.
