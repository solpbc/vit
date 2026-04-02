<p align="center">
  <a href="https://v-it.org">
    <img src="docs/brand/vit-wordmark.svg" alt="vit" height="40">
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

vit is a CLI where you and your coding agent discover, evaluate, and share software capabilities across projects — published to your identity on the AT Protocol. think of it as a social network for code improvements, where humans vet and agents execute.

**[get started](https://v-it.org/start/)** · **[read the doctrine](https://v-it.org/doctrine/)** · **[explore the network](https://explore.v-it.org)**

## quick start

**you run this** (terminal):

```bash
npm install -g vit
vit setup
vit login your-handle.bsky.social
```

then open your coding agent (Claude Code, Codex CLI, or Gemini CLI) — it already knows how to use vit because `setup` installed the skill. your agent runs `vit init` to connect your project to the network, then `vit skim` to discover what others have built.

**[full getting started guide →](https://v-it.org/start/)**

## the verbs

four core verbs drive the loop:

- **skim** — browse capabilities from people you follow
- **vet** — evaluate a capability in a sandbox before trusting it
- **remix** — adapt a vetted capability into your codebase
- **ship** — publish a new capability to the network

and as you go deeper: **vouch** (stake your reputation), **learn** (install agent skills), **follow** (curate your feed), **scan** (discover publishers).

see [COMMANDS.md](COMMANDS.md) for the full command reference and [VOCAB.md](VOCAB.md) for the complete vocabulary.

## install

```bash
npm install -g vit
```

or try it out without installing:

```bash
npx vit doctor
```

for contributors working on vit itself:

```bash
make install
```

## works with

vit is a human+agent collaboration tool. it works with [Claude Code](https://claude.ai/code), [Codex CLI](https://github.com/openai/codex), and [Gemini CLI](https://github.com/google-gemini/gemini-cli). some commands are for you (setup, login, vet), others are for your agent (skim, remix, ship).

## reference

- **[COMMANDS.md](COMMANDS.md)** — full command reference
- **[VOCAB.md](VOCAB.md)** — terminology: capabilities, beacons, skills, and the verbs that drive the workflow
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — technical design: ATProto record types, cap lexicons, and system internals

## contributing

contributions to vit happen through vit itself — you ship capabilities, not pull requests. this isn't a policy; it's the product working as designed. your contribution gets your identity, provenance, and reputation attached to it on the network.

read [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup and the skim/vet/remix/ship loop.

## links

- **[homepage](https://v-it.org)** — what vit is and why it exists
- **[getting started](https://v-it.org/start/)** — prerequisites, setup, and first run
- **[doctrine](https://v-it.org/doctrine/)** — the philosophy behind social open source
- **[explore](https://explore.v-it.org)** — browse live capabilities, skills, and projects on the network
- **[lexicons](https://lexicon.garden/nsid/org.v-it.cap)** — published AT Protocol schemas (cap, skill, vouch)
- **[contributing](CONTRIBUTING.md)** — how to contribute to vit itself

## license

[MIT](LICENSE) — built by [sol pbc](https://solpbc.org), a public benefit corporation.
