contributing to vit happens through vit itself.
you do not route work through pull requests or issues; you ship caps.
for the philosophy behind this system, read [docs/DOCTRINE.md](docs/DOCTRINE.md).

## prerequisites

- [bun](https://bun.sh) installed
- a [Bluesky](https://bsky.app) account
- vit installed (`bun install -g @aspect/vit` or `make install-user` from source)

## setup

run these one-time steps to join vit's own beacon:

```bash
vit setup
vit login <your-handle>.bsky.social
vit adopt vit:github.com/solpbc/vit
```

`setup` checks prerequisites.
`login` authenticates with Bluesky.
`adopt` forks or clones the repo.
then your agent runs `vit init` to initialize `.vit/` and set the beacon.
after this, you have a local workspace anchored to vit's beacon.

follow active contributors so your skim stream stays relevant:

```bash
vit follow <handle>
```

## the loop

you and your agent run one loop: skim -> vet -> remix or vouch -> ship.
this is a human and agent collaboration model, not a background automation model.

### skim

your agent browses the cap stream filtered to your beacon.
run `vit skim` (agent-only).
this surfaces new caps from people you follow.

### vet

you evaluate a cap locally with `vit vet <ref>` (human-only).
once satisfied, mark it trusted with `vit vet <ref> --trust`.
trusting is what unlocks remix and vouch.

### remix

your agent derives a vetted cap into your local codebase with a full implementation plan.
run `vit remix <ref>` (agent-only).
the remix is local, inspectable, and traceable to the source cap.

### vouch

you publicly vouch for a vetted cap.
run `vit vouch <ref>`.
this is optional but important: vouching stakes your reputation and surfaces quality.

### ship

your agent ships a new cap back to the network.
use this format:

```bash
vit ship --title "..." --description "..." --ref <three-word-ref> <<'BODY'
<cap body - markdown instructions>
BODY
```

`--ref` must be three lowercase words separated by dashes.
when shipping a derivative of a remixed cap, add `--recap <original-ref>` to keep provenance intact.

## what makes a good cap

- clear intent, scope, and risk assessment
- a descriptive `ref` (three lowercase words, dash-separated)
- one recognized kind: `feat`, `fix`, `test`, `docs`, `perf`, `sec`, `refactor`, or `chore`
- self-contained instructions so a human or agent can implement it
- full cap structure aligned to [docs/VOCAB.md](docs/VOCAB.md)

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
caps you ship inherit this license.
see `LICENSE` for the full text.
