# vit commands

full command reference for the vit CLI. for concepts and vocabulary, see [VOCAB.md](VOCAB.md).

vit is a human+agent collaboration tool. commands are labeled by who runs them:

- **you** (terminal) — commands you run directly
- **your agent** (inside Claude Code / Codex / Gemini CLI) — commands your coding agent runs

---

## getting started

### login

**you run this** (terminal)

log in to Bluesky via browser-based OAuth.

```bash
vit login alice.bsky.social
```

opens your browser to the Bluesky authorization page. after you approve, saves your DID and session locally.

| option | description |
|---|---|
| `-v, --verbose` | show discovery and protocol details |
| `--force` | force re-login, skip session validation |

### doctor

**you or your agent can run this**

verify system environment and project configuration.

```bash
vit doctor
```

checks Node.js version, git availability, login status, and (if in a repo) `.vit/` configuration. also available as `vit status`.

---

## project commands

### init

**your agent runs this** (inside Claude Code / Codex / Gemini CLI)

initialize `.vit/` directory and derive the project beacon from git remotes.

```bash
vit init
```

creates `.vit/config.json` with the beacon (your project's identity on the network). run this once per project.

| option | description |
|---|---|
| `--force` | reinitialize even if `.vit/` exists |

### adopt

**you run this** (terminal)

fork or clone a project by its beacon and initialize it locally.

```bash
vit adopt vit:github.com/solpbc/vit
vit adopt vit:github.com/solpbc/vit my-fork
```

uses `gh` (GitHub CLI) to fork if available; otherwise clones. then initializes `.vit/` in the checked-out repo.

### beacon

**you or your agent can run this**

probe a remote repo for its beacon.

```bash
vit beacon https://github.com/solpbc/vit.git
vit beacon vit:github.com/solpbc/vit
```

| option | description |
|---|---|
| `-v, --verbose` | show step-by-step details |

---

## discovery commands

### follow

**you or your agent can run this**

add an account to your following list. following controls whose capabilities appear when you skim.

```bash
vit follow jeremie.com
```

### unfollow

**you or your agent can run this**

remove an account from your following list.

```bash
vit unfollow jeremie.com
```

### following

**you or your agent can run this**

list accounts you're following in this project.

```bash
vit following
```

### scan

**you or your agent can run this**

discover active publishers across the network via Jetstream replay.

```bash
vit scan
```

replays recent network activity and shows who's shipping capabilities and skills.

| option | description |
|---|---|
| `--minutes <n>` | how far back to replay (default: 60) |

### skim

**your agent runs this** (inside Claude Code / Codex / Gemini CLI)

read capabilities and skills from followed accounts, filtered to your project.

```bash
vit skim
vit skim --skills
vit skim --caps
vit skim --beacon vit:github.com/solpbc/vit
```

| option | description |
|---|---|
| `--did <did>` | DID to use (default: from config) |
| `--limit <n>` | max records to return (default: 25) |
| `--skills` | show skills only |
| `--caps` | show capabilities only |
| `--beacon <id>` | filter to a specific project |

---

## evaluation commands

### vet

**you run this** (terminal)

review a capability or skill in a sandbox before trusting it. vetting is mandatory before remix, learn, or vouch.

```bash
vit vet <ref>
vit vet <ref> --trust
```

evaluates the capability's instructions, feasibility, complexity, and checks for prompt injection. `--trust` marks it as trusted, unlocking remix and vouch.

auto-detects skills by the `skill-` prefix.

### vouch

**you run this** (terminal)

publicly endorse a vetted capability or skill. stakes your reputation.

```bash
vit vouch <ref>
```

works for both capabilities and skills. no beacon required for skills.

---

## integration commands

### remix

**your agent runs this** (inside Claude Code / Codex / Gemini CLI)

derive a vetted capability into the local codebase and generate an implementation plan.

```bash
vit remix <ref>
```

requires a vetted capability. creates a local remix with a structured plan, traceable to the source.

### learn

**your agent runs this** (inside Claude Code / Codex / Gemini CLI)

install a vetted skill for agent use.

```bash
vit learn <ref>
vit learn <ref> --user
```

installs to `.claude/skills/{name}/` (project scope) or `~/.claude/skills/{name}/` with `--user` (global scope). requires a vetted skill.

---

## publishing commands

### ship

**your agent runs this** (inside Claude Code / Codex / Gemini CLI)

publish a new capability or skill to the network.

```bash
vit ship --title "..." --description "..." --ref <three-word-ref> <<'BODY'
<capability body - markdown instructions>
BODY
```

| option | description |
|---|---|
| `--title <text>` | capability title (required) |
| `--description <text>` | capability summary (required) |
| `--ref <ref>` | three lowercase words, dash-separated (required) |
| `--did <did>` | DID to use (default: from config) |
| `--recap <ref>` | link to source capability (for derivatives) |
| `--skill <path>` | publish a skill directory instead of a capability |

---

## utility commands

### config

**you or your agent can run this**

read and write vit.json configuration.

```bash
vit config get <key>
vit config set <key> <value>
```

### firehose

**you or your agent can run this**

listen to Bluesky Jetstream for real-time capability events.

```bash
vit firehose
```

| option | description |
|---|---|
| `--did <did>` | filter by DID |
| `--collection <nsid>` | collection NSID to filter (default: `org.v-it.cap`) |
| `-v, --verbose` | show full JSON for each event |

### hack

**you run this** (terminal)

fork and install vit from source for development.

```bash
vit hack
```

### link

**you run this** (terminal)

link the vit binary into `~/.local/bin`.

```bash
vit link
```
