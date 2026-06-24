# Chalk Protocol

A **layer-2 agent harness**: a durable `.chalk/` project-state spine + a CLI that drives
any coding agent (Claude Code, Codex, Gemini CLI) through a **read → work → verify → write**
loop. It does not write code. Its job is to hold the agent to software-development
fundamentals via *enforceable gates* — the things [the evidence](./RESEARCH.md) says
autonomous agents skip on their own.

BYO-CLI: the agent is a pluggable executor; Chalk owns state + gates.

## Why

Frontier models are strong coders, so the harness shouldn't try to code better. The
research is blunt about where agents fail without scaffolding:

- they **can't self-certify "done"** — LLMs don't reliably self-correct without external
  feedback (ICLR'24);
- given write access to the tests that judge them, they **cheat 49–54%** of the time
  (ImpossibleBench) and reward-hack the evaluator (METR);
- "tests-as-spec" works on small tasks but **degrades with complexity**.

So Chalk enforces seven primitives as gates. See [PROTOCOL.md](./PROTOCOL.md).

## The gates (what makes it more than a notepad)

| Gate | Refuses unless… |
|------|-----------------|
| `start` (P1) | the task has machine-checkable acceptance criteria |
| `done` (P4) | `chalk verify` (test/lint/typecheck/build) is green |
| `done` (P6) | the locked acceptance tests are byte-for-byte unchanged |
| `done` (P5) | if `review.required`, an adversarial reviewer passed (overridable, logged) |
| `phase` (P7) | if `regression.required`, the held-out audit is green & fresh (overridable, logged) |
| `amend-spec` (P6) | a test change is explicit + reason-logged (the only way to edit a locked test) |

## Quickstart

```sh
node bin/chalk.mjs init --name myapp --goal "what we're building"
# set verify commands in .chalk/chalk.json → protocol.verify, e.g. { "test": "npm test", "typecheck": "tsc --noEmit" }

node bin/chalk.mjs task add "implement X"
node bin/chalk.mjs spec <id> --criterion "X does Y" --test test/x.test.ts   # locks the test
node bin/chalk.mjs start <id>        # blocked without criteria (P1)
node bin/chalk.mjs context <id>      # the agent reads this before working (P3)
# ... agent writes code ...
node bin/chalk.mjs verify            # external toolchain + integrity (P4/P6/P7)
node bin/chalk.mjs done <id>         # blocked unless verify is green & tests intact
```

Run `node bin/chalk.mjs help` for the full surface. (Or `npm link` to get `chalk` on PATH.)

## Agent layer

`chalk init` installs the protocol contract into `AGENTS.md` and `CLAUDE.md` (a managed,
idempotent block that preserves your existing content), so Claude Code / Codex / Gemini CLI
auto-load it. The agent's entrypoint each turn is **`chalk next`** — it inspects spine state
and returns the single next action (which task, which gate is blocking), and surfaces a
tampered-test integrity break before `verify` is even run. Re-run with `chalk agents`.

## Adversarial review (P5)

Configure a reviewer in `.chalk/chalk.json` under `protocol`:
`"review": { "command": "claude -p", "required": true }`. `chalk review <id>` runs it
against the task's diff + criteria with an adversarial prompt (try to *refute* the change;
check test-adequacy, design-intent, regressions) and records a JSON verdict. When required,
`done` blocks until it passes — catching the case where **verify is green but the test was
inadequate**. Overridable with `chalk done <id> --force-review --why "..."` (logged).

## Held-out regression (P7)

The visible test suite stops measuring the spec once it becomes the optimization target, so
Chalk keeps a regression/composition set under `.chalk/held-out/` that the implementing agent
**never reads**. In a solo harness "held-out" means separation of *role + visibility*, not a
second human: `chalk guard` authors it from the **spec** (blind to the code) and hash-locks
it; `chalk context` only mentions it exists; `chalk audit` runs it with **output withheld**
(pass/fail only — nothing to overfit to). `audit` gates `phase` advances and goes stale
whenever code size changes. Configure with
`protocol.regression`: `{ "command": "...", "authorCommand": "...", "required": true }`.

## Status

v0 proof-of-concept, demoed end-to-end — **all seven research-backed primitives (P1–P7) are
enforced**, plus the agent layer (`AGENTS.md`/`CLAUDE.md` contract + `chalk next`). The
`.chalk/` event log uses the Chalk Projects portal's update vocabulary, so the spine can feed
the portal without a separate export. Next: point Chalk at a real project; wire `guard gen` to
a live model; consider per-task diff-size caps.
