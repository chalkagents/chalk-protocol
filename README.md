# Chalk Protocol

A **layer-2 harness for coding agents**: a durable `.chalk/` project spine + a CLI that drives
any agent (Claude Code, Codex, Gemini CLI) through a **read → work → verify → write** loop and
holds it to software-development fundamentals via *enforceable gates*.

Chalk **does not write code** — your agent does. Chalk owns the state and the gates: the steps
[the evidence](./RESEARCH.md) says autonomous agents skip on their own. Frontier models can't
reliably self-certify "done"; given access to the tests that judge them they cheat ~half the
time; and "tests-as-spec" degrades as tasks grow. So Chalk makes "done" rest on an **external
check, never the agent's word.**

> **BYO agent.** The agent is a pluggable executor (`claude -p`, etc.); Chalk is the referee.

---

## How it works (the mental model)

**1. The spine — `.chalk/`.** One source of truth: tasks + acceptance criteria, locked tests,
decisions, lessons, an event log. Created by `chalk init`, read by every command.

**2. The loop — one task at a time.** The agent's entrypoint each turn is **`chalk next`**, which
inspects the spine and returns the single next action.

```
chalk next ──► read (chalk context <id>) ──► work (agent writes code) ──► verify ──► done
   ▲                                                                                  │
   └────────────────────────────────  next task  ◄───────────────────────────────────┘
```

**3. The gates — why it's more than a notepad.** Each gate *refuses to advance* unless a
fundamental is met (full model in [PROTOCOL.md](./PROTOCOL.md)):

| Gate | Refuses unless… |
|------|-----------------|
| `start` (P1) | the task has machine-checkable acceptance criteria |
| `done` (P4) | `chalk verify` (test/lint/typecheck/build) is green |
| `done` (P6) | the **locked** acceptance tests are byte-for-byte unchanged |
| `done` (P5) | an **adversarial review** passed — catches *verify-green-but-the-test-was-inadequate* (overridable, logged) |
| `work` | a feature ships a test (lever 1) that **fails without the change** (lever 3, opt-in) — no vacuous passes |
| `phase` (P7) | a **held-out** regression audit (which the implementing agent never reads) is green & fresh |
| `amend-spec` (P6) | a locked-test change is explicit + reason-logged — the only sanctioned way to edit one |

The rule that ties it together: **the agent never self-declares success — the gate decides.**

---

## Install

```sh
git clone <this repo> && cd chalk-protocol
npm link          # puts `chalk` on your PATH  (or just use `node bin/chalk.mjs`)
node --test       # optional: run the suite (zero dependencies, Node ≥ 18)
```

---

## Use it — the task loop

Run these in **your** project; Chalk drives the agent there:

```sh
chalk init --name myapp --goal "what we're building"   # scaffolds .chalk/ + installs the agent contract
# tell Chalk how to verify: edit .chalk/chalk.json → protocol.verify, e.g. { "test": "npm test" }
#   (or `chalk init --preset node|flutter|python|go` to fill it in)

chalk task add "implement X"
chalk spec <id> --criterion "X does Y" --test test/x.test.ts   # add criteria + LOCK the test
chalk start <id>          # GATE P1: refuses without criteria
chalk context <id>        # the blob the agent reads first (spec, criteria, at-risk tests, lessons)
#   ... the agent writes code to satisfy the criteria ...
chalk verify              # external toolchain + locked-test integrity — loop until GREEN
chalk done <id>           # GATE: refuses unless verify is green, locks intact, (review passed)
```

`chalk init` writes the protocol contract into `AGENTS.md` / `CLAUDE.md`, so Claude Code / Codex /
Gemini CLI auto-load it and know to drive themselves via `chalk next`. Lost? Run `chalk next` —
it always tells you the one next action.

---

## Use it — autonomously

Wire an executor and let Chalk run the loop unattended. The gates are the only safety (no `--force`
on the core gates):

```jsonc
// .chalk/chalk.json → protocol
"executor": { "command": "claude -p --permission-mode acceptEdits" }
```

```sh
chalk run                 # drive every runnable task: executor → verify → (review) → done
```

For a full **GitHub issue → merge** pipeline (BYO `gh` + git worktrees):

```sh
chalk issue pull          # import open issues as tasks
chalk pipeline            # per task: branch → plan → work → commit → PR → review → merge → cleanup
```

At merge, the pipeline requires what a careful human would: a **recording** of what was done in the
PR body, the reviewer's verdict posted **on the PR** with an **LGTM**, and a **broke-check** (remote
CI if present, else a local re-verify). A blocking review triggers a **fix → re-verify → re-review**
loop; a task that can't finish leaves a **handoff** doc and parks (`chalk block`) so the run keeps
moving. Full guide: [RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md).

---

## The full product lifecycle

Beyond the dev cycle, Chalk closes the loop from idea → shipped → learned-from:

```
discover ─► plan + approve ─► work ─► verify ─► review-on-PR ─► LGTM ─► merge ─► release ─► feedback ─┐
(brief →    (the human                  └─ the dev cycle above ─┘                (notes +   (signals  │
 backlog)    checkpoint)                                                          version)   → issues)│
    ▲                                                                                                  │
    └───────────────── chalk portal publishes client-facing status throughout ──── new backlog ◄───────┘
```

| Command | Stage |
|---|---|
| `chalk discover "<brief>"` | turn a product brief into scoped, criteria-bearing tasks |
| `chalk plan <id>` → `chalk approve-plan <id>` | planner drafts an approach + scoping questions; a human approves **before** any code (set `protocol.plan.required: true`) |
| `chalk release` | ship merged work — release notes + semver bump + git tag (`--dry-run` to preview) |
| `chalk feedback` | turn signals dropped in `.chalk/feedback/` into improvement issues |
| `chalk portal` | publish the spine as client-facing data under `.project/` |
| `chalk retro` | self-heal: distill lessons + file improvement issues from a run |

---

## Try the whole loop in one command

No LLM or GitHub needed — a throwaway project wired with **stub agents** runs every stage so you can
watch it end-to-end:

```sh
bash examples/lifecycle-demo.sh
```

Swap the stub agents for `claude -p` (and point `github.command` at `gh`) to run it for real.

---

## Configuration

Everything lives in `.chalk/chalk.json` under `protocol`. Each agent is a BYO command that reads its
input on stdin and prints a result; **leave a command empty to turn that stage off.**

```jsonc
{
  "protocol": {
    "verify":     { "test": "npm test", "lint": "eslint .", "build": { "cmd": "npm run build", "when": "phase" } },
    "executor":   { "command": "claude -p --permission-mode acceptEdits" },  // writes the code
    "planner":    { "command": "claude -p" },                                 // drafts the approach
    "review":     { "command": "claude -p", "requiredAt": ["per-task"] },     // adversarial reviewer (P5)
    "regression": { "command": "npm test -- .chalk/held-out", "required": true }, // held-out audit (P7)
    "plan":       { "required": true },        // gate work on an approved plan (the human checkpoint)
    "breakTest":  "npm test -- {test}",        // lever 3: prove a locked test fails without the change
    "mutation":   "npx stryker run --mutate {file}",  // lever 3 (rigorous): tests must KILL seeded mutants in changed code
    "discovery":  { "command": "claude -p" },  // brief → backlog
    "feedback":   { "command": "claude -p" },  // signals → issues
    "github":     { "command": "gh", "base": "main", "mergeMethod": "squash" },
    "portal":     { "dir": ".project" }
  }
}
```

Two gates worth understanding:
- **Review (P5)** runs *adversarially* — it tries to *refute* the change (test-adequacy, design-intent,
  regressions), so it catches a green-but-inadequate test. Run it on a **different model family** than the
  executor — a same-model reviewer self-prefers and shares the author's blind spots; `chalk doctor` warns
  when they match. Overridable with `chalk done <id> --force-review --why "..."` (logged).
- **Held-out (P7)** keeps a regression set under `.chalk/held-out/` the implementing agent **never
  reads**: `chalk guard` authors it from the *spec* (blind to the code), `chalk audit` runs it with
  results withheld (pass/fail only — nothing to overfit to) and gates `phase` advances.

`chalk doctor` previews readiness before an autonomous run; `chalk status` / `chalk backlog` /
`chalk log` show where things stand.

---

## Status

Zero-dependency proof-of-concept (Node ≥ 18), **dogfooded on itself** — every command above was built
through Chalk's own gated loop. Enforces all seven primitives (P1–P7) plus the agent contract and the
full product lifecycle. The `.chalk/` event log uses the Chalk Projects portal's vocabulary, so the
spine feeds the portal without a separate export.

## Going deeper

- **[PROTOCOL.md](./PROTOCOL.md)** — the seven primitives (P1–P7) and the full gate model.
- **[RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md)** — the unattended pipeline, end to end.
- **[RESEARCH.md](./RESEARCH.md)** — the evidence each gate is built on.
- **`chalk help`** — the full command surface.
