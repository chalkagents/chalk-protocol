# Chalk Protocol v0 (`chalk/0`)

A **layer-2** convention: a durable project-state *spine* in a `.chalk/` directory plus a
CLI that drives any coding agent (Claude Code, Codex, Gemini CLI) through a
**read → work → verify → write** loop.

The protocol does **not** write code. Its only job is to hold the agent to fundamentals
the evidence says it skips on its own (see [RESEARCH.md](./RESEARCH.md)): work against a
locked spec, never self-certify "done", never grade itself, don't drift. BYO-CLI — the
agent is a pluggable executor; Chalk owns state + gates.

Design rule: **every primitive is a gate or a piece of state, not a vibe.** If a rule
can't be enforced by the CLI or stored in a file, it doesn't belong in the protocol.

---

## The spine — `.chalk/`

```
.chalk/
  chalk.json        # canonical identity + nested `protocol` config block (CLI-managed)
  tasks.json        # the work units + their lifecycle + locked tests    (CLI-managed)
  spec.md           # durable, human/agent-authored "what we're building" (free-form)
  decisions.md      # append-only ADR-lite log                           (append)
  updates.jsonl     # append-only event log, portal-vocab                (append)
  questions.json    # open questions / blockers needing a human          (CLI-managed)
  held-out/         # P7 regression set — OFF-LIMITS to the implementer   (guard-managed)
```

Compatible with the existing Chalk ecosystem: `chalk.json` keeps `version` /
`project.name` / timestamps; `updates.jsonl` uses the portal's update-type vocabulary
(`progress-update`, `milestone-hit`, `decision-logged`, `work-item-*`) so it feeds the
Chalk Projects portal without a separate export.

---

## The task lifecycle (the heart of the protocol)

```
   todo ──spec──▶ specd ──start──▶ in-progress ──done──▶ done
                    ▲                                  │
                    └────────── amend-spec ────────────┘   (gated test change)
```

Each transition is a CLI command, and three of them are **gates** that refuse to advance
unless a fundamental is satisfied:

| Transition | Gate | Why (evidence) |
|------------|------|----------------|
| `start` | **P1** — task MUST carry ≥1 machine-checkable acceptance criterion (assertion or test file) | Spec/tests-as-intent before code; TiCoder, Spec-Kit |
| `done` | **P4 + P6 (+ P5)** — `chalk verify` green, locked test hashes unchanged, and (if `review.required`) the adversarial review passed | LLMs can't self-certify (Huang, CRITIC); agents cheat on writable tests (ImpossibleBench, METR); agent review necessary-but-insufficient (Human-AI Synergy) |
| `amend-spec` | the **only** path to change a locked acceptance test; logs a decision | Test integrity — separate the "change the spec" act from the "pass the spec" act |

A task records: `id, title, state, acceptanceCriteria[], tests[{path, sha256}],
heldOut[], createdAt, startedAt, doneAt, reviews[]`.

---

## The seven primitives

- **P1 — Acceptance-criteria precondition.** No agent starts a task without
  machine-checkable criteria. `chalk start` enforces it.
- **P2 — Tests are a locked contract; tasks stay small.** Acceptance tests are hashed at
  `spec` time. Tasks should be single-feature — the "tests-as-spec" regime degrades with
  complexity, so decomposition is part of the contract.
- **P3 — Context over procedure.** `chalk context` surfaces *which tests are at risk* and
  the relevant spec slice — a test-impact map, not a verbose TDD checklist. (Procedural
  test-first prompting can backfire on weaker models.)
- **P4 — External verification gate.** `chalk verify` runs the real toolchain
  (`test`, `lint`, `typecheck`, `build` from `chalk.json`). `done` is impossible until it
  is green. The agent's self-review is a *pre-filter only*, never the authority.
- **P5 — Adversarial review gate.** `chalk review` runs a configured BYO reviewer
  (`review.command`, e.g. `claude -p`) that is prompted to *refute* the change and is forced
  to cover the dimensions agents miss — **test-adequacy, design-intent, regressions**. It
  returns a JSON verdict; when `review.required`, `done` blocks until it passes. Because
  AI review is fallible, the gate is overridable via `done --force-review --why "..."`
  (logged as a decision).
- **P6 — Test integrity.** Acceptance tests are read-only to the implementing agent.
  `verify` recomputes their hashes; a mismatch fails the gate with "tests modified — route
  via `chalk amend-spec`". Grading/scoring logic is kept out of the agent's editable
  workspace.
- **P7 — Held-out regression, size-scaled.** A regression/composition set under
  `.chalk/held-out/` that the implementing agent never reads. In a solo harness "held-out"
  = separation of **role + visibility**, not a second human: `chalk guard` authors it from
  the **spec** (blind to the implementation), it's hash-locked, excluded from `chalk
  context`, and `chalk audit` runs it **with output withheld** (pass/fail only, so the agent
  can't overfit). `audit` is the system-level gate at **phase boundaries**, and it goes stale
  (re-required) whenever code size changes — so stringency scales with cumulative code.

---

## The agent contract (read → work → verify → write)

An agent driven by Chalk MUST, per task:

1. **read** — `chalk context <id>`: ingest project state, the task's acceptance criteria,
   the at-risk test map, and the spec slice. Do not start work from memory.
2. **start** — `chalk start <id>`: blocked unless criteria exist (P1).
3. **work** — implement, using its own CLI. Treat acceptance + held-out tests as read-only.
4. **verify** — `chalk verify`: external toolchain + test-integrity (P4, P6, P7). Loop
   until green; do not self-declare success.
5. **write** — `chalk done <id>` (gated), and record what changed:
   `chalk update`, `chalk decision`, `chalk question` — all append to the spine and feed
   the portal.

If a step is skipped, the corresponding gate refuses to advance. That refusal *is* the
protocol.

**How the agent learns the contract.** `chalk init` (and `chalk agents`) installs the
contract into `AGENTS.md` and `CLAUDE.md` as a managed block, so any CLI auto-loads it.
The agent's entrypoint each turn is `chalk next`, which inspects spine state and returns
the single next action — including surfacing an integrity break before `verify` is even run.

---

## CLI surface (v0)

```
chalk init [--name N] [--goal G]        scaffold .chalk/ + install agent contract into AGENTS.md/CLAUDE.md
chalk agents                            (re)install the agent contract (idempotent managed block)
chalk status                            phase, task board, open questions, recent updates
chalk next                              AGENT ENTRYPOINT: the single next action / blocking gate
chalk context [<id>]                    agent-facing read blob (P3 test-impact map)

chalk task add "<title>"                create task in `todo`
chalk spec <id> --criterion "..."       attach acceptance criterion (repeatable)
chalk spec <id> --test <path>           attach + LOCK (hash) an acceptance test  (P2/P6)
chalk start <id>                        GATE P1: refuse without criteria
chalk verify                            run toolchain + integrity check (P4/P6/P7)
chalk done <id>                         GATE P4+P6: refuse unless verify green & intact
chalk amend-spec <id> --test <path>     gated test change; re-locks + logs decision (P6)
chalk review <id>                       run the adversarial reviewer; record verdict (P5)
chalk done <id> --force-review --why    override a failing review (logged decision)
chalk guard add <path> | gen | list     author/lock the held-out regression set (P7)
chalk audit                             run held-out set (output withheld); gates phase advance (P7)
chalk phase <p> [--force-audit --why]   advance phase; blocked unless audit is green & fresh (P7)

chalk update "<title>" [--type T]       append event to updates.jsonl
chalk decision "<title>" [--why W]      append ADR-lite + decision-logged event
chalk question add "<q>" [--for us|client]
chalk log [--n N]                       recent timeline
```

### `chalk.json` shape

The top level stays a clean canonical citizen (conforms to `chalk.schema.json`: `version`
+ `project.name`); all Chalk Protocol config nests under one `protocol` key so it never
collides with canonical fields and the Chalk Browser preserves it on enrich:

```json
{
  "version": "1.0",
  "project": { "name": "myapp", "description": "what we're building" },
  "protocol": {
    "version": "chalk/0",
    "phase": "discovery",
    "status": "active",
    "verify":     { "test": "npm test", "typecheck": "tsc --noEmit", "lint": "eslint .", "build": "npm run build" },
    "review":     { "command": "claude -p", "required": true },
    "regression": { "command": "<runner for .chalk/held-out>", "authorCommand": "<BYO author>", "dir": ".chalk/held-out", "required": true, "tests": [], "lastAudit": null }
  },
  "createdAt": "<iso>", "updatedAt": "<iso>"
}
```

- `protocol.verify` maps gate names to shell commands; a missing command is skipped (and
  reported), not failed.
- `protocol.review` (P5): the reviewer reads the prompt on stdin and prints a JSON verdict
  (`{"verdict":"pass"|"block","findings":[...]}`) on stdout. BYO-reviewer: any CLI/script.
- `protocol.regression` (P7): `command` is run by `chalk audit` with output discarded
  (pass/fail by exit code); `authorCommand` (optional) is fed the spec by `chalk guard gen`
  and writes test files into `dir`, which are then hash-locked.
