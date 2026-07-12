# Chalk Protocol

A **layer-2 harness for coding agents**: a durable `.chalk/` project spine + a CLI that drives
any agent (Claude Code, Codex, Gemini CLI, opencode) through a **read → work → verify → write**
loop and holds it to software-development fundamentals via *enforceable gates*.

Chalk **does not write code** — your agent does. Chalk owns the state and the gates: the steps
[the evidence](./RESEARCH.md) says autonomous agents skip on their own. Frontier models can't
reliably self-certify "done"; given access to the tests that judge them they cheat ~half the
time; and "tests-as-spec" degrades as tasks grow. So Chalk makes "done" rest on an **external
check, never the agent's word.**

> **BYO agent.** The agent is a pluggable executor (`claude -p`, `opencode run`, any stdin/stdout
> command); Chalk is the referee. **The agent never self-declares success — the gate decides.**

**Website:** [protocol.chalkagents.com](https://protocol.chalkagents.com) — the protocol in one page.

---

## See it refuse in 60 seconds

```sh
npx chalk-protocol demo        # or: chalk demo, once installed
```

![chalk demo — the full gated lifecycle, including two refusals](./docs/assets/demo.gif)

A throwaway project + stub agents (no LLM, no GitHub, no network) runs the **entire lifecycle** —
discover → plan → work → verify → review → done → release → feedback → portal — and stages the two
moments that make chalk chalk:

1. `chalk work` is **REFUSED** until a human approves the plan;
2. a "sneaky agent" edits a **locked** acceptance test → `chalk verify` goes RED with
   `test-integrity VIOLATED (P6)` — the tamper is caught, on screen.

~1 minute, cleans up after itself (`--keep` to poke around). Swap the stubs for `claude -p` in
`.chalk/chalk.json` and the same loop runs for real.

---

## Install

```sh
npm install -g chalk-protocol       # puts `chalk` on your PATH (Node ≥ 18, zero dependencies)
# or try it without installing:  npx chalk-protocol demo
# or from source:                git clone https://github.com/chalkagents/chalk-protocol && cd chalk-protocol && npm link
node --test                         # (source checkout) run the suite — hermetic, no network
```

---

## First real task in ~10 minutes

Run these in **your** project ([QUICKSTART.md](./QUICKSTART.md) is the full walkthrough, including
the no-LLM manual mode):

```sh
chalk init --name myapp --goal "what we're building"
#   auto-detects your stack (node/flutter/dart/python/go) and fills the verify commands;
#   add --executor claude to wire the full Claude Code agent suite (ships with chalk)

chalk task add "implement X"
chalk spec <id> --criterion "X does Y" --test test/x.test.ts   # criteria + LOCK the test (P2)
chalk start <id>          # GATE P1: refuses without criteria
# ...you or your agent write code...
chalk verify              # external toolchain + locked-test integrity — loop until GREEN
chalk done <id>           # GATE: refuses unless verify is green, locks intact, (review passed)
```

`chalk init` also writes the protocol contract into `AGENTS.md`/`CLAUDE.md` so agent CLIs auto-load
it and drive themselves via `chalk next`. Lost at any point? `chalk next` names the one next action.
`chalk doctor` preflights an autonomous run (per-OS install hints, `--json` for bug reports).

## The gates (why it's more than a notepad)

Each gate *refuses to advance* unless a fundamental is met (full model: [PROTOCOL.md](./PROTOCOL.md)):

| Gate | Refuses unless… |
|------|-----------------|
| `start` (P1) | the task has machine-checkable acceptance criteria |
| `done` (P4) | `chalk verify` (test/lint/typecheck/build) is green |
| `done` (P6) | the **locked** acceptance tests are byte-for-byte unchanged |
| `done` (P5) | an **adversarial review** passed — catches *verify-green-but-the-test-was-inadequate* (overridable, logged) |
| `work` | a feature ships a test (lever 1) that **fails without the change** (lever 3, on by default for stacks with a truthful per-file runner) — no vacuous passes |
| `phase` (P7) | a **held-out** regression audit (which the implementing agent never reads) is green & fresh |
| `amend-spec` (P6) | a locked-test change is explicit + reason-logged — the only sanctioned way to edit one |

And the traps are labeled: an empty verify prints `⚠ VACUOUS`, an unrunnable break-it/mutation
probe prints `INCONCLUSIVE` instead of silently passing, and a truncated review diff says so.

## Autonomous mode

```sh
chalk run                 # unattended: executor → verify → (review) → done, per runnable task
chalk issue pull          # import GitHub issues as tasks (BYO gh)
chalk pipeline            # per task: branch → plan → work → commit → PR → review-on-PR → LGTM → merge
```

At merge the pipeline requires what a careful human would: a recorded "what was done" in the PR
body, the reviewer's verdict + **LGTM posted on the PR**, and a **broke-check** (remote CI when the
PR has it — labeled when it falls back to local verify). Blocking reviews trigger a bounded
fix → re-verify → re-review loop; stuck tasks park with a **handoff** doc and the run keeps moving.
Full guide: [RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md).

Beyond the dev cycle, the loop closes end-to-end: `chalk discover` (brief → scoped backlog),
`chalk release` (notes + semver + tag), `chalk feedback` (signals → issues), `chalk retro`
(lessons + self-filed improvements), `chalk portal` (client-facing status), `chalk archive`
(compact a long-lived spine without losing history).

## Does the gate actually catch anything?

![An AI agent games its own locked test — it breaks the code, then guts the acceptance test until `node --test` passes — and `chalk done` still refuses. The gate decides, not the agent.](./docs/assets/cheat-caught.gif)

*Caught in 30 seconds, no LLM: an agent breaks its code, then guts its own locked acceptance test until the test runner reports green — and the gate refuses to mark it done anyway.*

Chalk measures itself. `chalk stats` reports what its gates caught over your whole history
(live spine + archive) — review catches, churn made visible, gated-vs-bypassed landings.
`chalk stats --public` renders a **PII-free, shareable** version (no task titles, paths, or
ids) you can paste into a README — the quantified answer to "agents grade their own homework":

```bash
chalk stats --public     # a markdown block: "the adversarial gate caught N changes the model's self-check had passed"
chalk stats --badge      # shields.io endpoint JSON for a README badge
```

## How is this different?

| | Spec/scaffold tools (Spec-Kit, Kiro) | `AGENTS.md` alone | CI | **Chalk** |
|---|---|---|---|---|
| When it acts | before coding | advisory, every prompt | after the PR | **at every gate, in the loop** |
| Can the agent ignore it? | yes, after scaffold | yes (it's prose) | no, but too late | **no — commands refuse** |
| Test integrity | — | — | — | **SHA-locked tests + sanctioned amend path** |
| Judge of "done" | the agent | the agent | the suite the agent wrote | **external verify + independent adversarial review + held-out audit** |

The research behind each gate — agents gaming visible tests (~0 when isolated), same-model
reviewer self-preference, held-out gaps growing with code size — is collected in
[RESEARCH.md](./RESEARCH.md).

## Configuration

Everything lives in `.chalk/chalk.json` under `protocol`; every agent is a BYO command reading
stdin → writing stdout, and **an empty command turns that stage off**. `chalk init` fills the
essentials from your stack; the full key-by-key reference is **[docs/CONFIG.md](./docs/CONFIG.md)**,
integrations: **[Claude Code](./docs/integrations/claude-code.md)** ·
**[opencode](./docs/integrations/opencode.md)**.

```jsonc
{ "protocol": {
    "verify":   { "test": "npm test" },                                   // the one required gate
    "executor": { "command": "claude -p --agent chalk-executor --permission-mode acceptEdits --max-turns 40" },
    "review":   { "command": "claude -p --agent chalk-reviewer --max-turns 20", "requiredAt": ["per-task"] },
    "breakTest": "node --test {test}"                                     // prove tests fail without the change
} }
```

## Status & feedback

Beta (protocol `chalk/0`), zero dependencies (Node ≥ 18), **dogfooded on itself** — every command
above was built through Chalk's own gated loop, and the `.chalk/` directory in this repo is our
real, living project state (yours will look like it). Enforces all seven primitives (P1–P7) plus
the agent contract and the full product lifecycle.

Trying chalk and hit a rough edge? A two-minute
**[friction report](https://github.com/chalkagents/chalk-protocol/issues/new?template=friction_report.yml)** —
"here's where I got stuck" — is the feedback we want most;
[bug reports and feature requests](https://github.com/chalkagents/chalk-protocol/issues/new/choose)
have templates too. Contributions go through the same gates as our own work: see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Going deeper

- **[QUICKSTART.md](./QUICKSTART.md)** — zero → first gated task, manual and Claude Code modes.
- **[PROTOCOL.md](./PROTOCOL.md)** — the seven primitives (P1–P7) and the full gate model.
- **[RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md)** — the unattended pipeline, end to end.
- **[docs/CONFIG.md](./docs/CONFIG.md)** — every `protocol.*` key: default, consumer, example.
- **[RESEARCH.md](./RESEARCH.md)** — the evidence each gate is built on.
- **`chalk help`** — the full command surface.
