---
name: chalk-codebase
description: A map of the chalk-protocol codebase — the lib/ modules, where CLI commands live, the gate model (P1–P7), and the autonomous pipeline stages. Load this to quickly understand where to make a change in this repo.
---

# chalk-protocol codebase map

Zero-dependency Node ESM. The CLI is `bin/chalk.mjs`; logic lives in `lib/*`. Tests are
`node --test` under `test/` (`protocol.test.mjs` = the gate suite, `pipeline.test.mjs` = the GitHub
pipeline). The `.chalk/` directory is the project-state spine.

## Where things live
- **`bin/chalk.mjs`** — every command is a method on the `cmds` object (init, next, task, spec, start,
  verify, done, review, audit, phase, issue, branch, plan, work, commit, pr, evidence, merge, cleanup,
  pipeline, autopilot, doctor, smoke, lesson, …). Help text + arg parser are here. Add a command by
  adding a method + a help line.
- **`lib/store.mjs`** — the spine `Store` (reads/writes `.chalk/`): tasks, meta/protocol config,
  `emitUpdate`/`updates`, `appendDecision`, `appendLesson`/`lessons`, `buildContext` (the agent
  read-blob), `initSpine`, the DAG helpers (`runnableTasks`/`depsSatisfied`), `workdir`. **Only writer
  of the spine.**
- **`lib/verify.mjs`** — the P4 toolchain gate + P6 integrity; `runToolchain` (per-gate `when:task|phase`).
- **`lib/review.mjs`** — the P5 adversarial reviewer (BYO command → JSON verdict); `captureDiff`.
- **`lib/regression.mjs`** — the P7 held-out audit.
- **`lib/config.mjs`** — `normGate`, `withRunner`, `reviewCadences`, `PRESETS`, `detectPreset` (back-compat parsing).
- **`lib/pipeline.mjs`** — the unattended driver: the `ORDER` of stages, run as subprocesses.
- **`lib/run.mjs`** — the `chalk run` executor loop. **`lib/autopilot.mjs`** — the scheduled-run unit.
- **`lib/git.mjs`** — BYO git/gh helpers + worktree lifecycle. **`lib/e2e.mjs`** / **`lib/evidence.mjs`** — browser specs + screenshots.

## The gates (the product's whole value)
P1 acceptance-criteria-before-start · P4 external verify before done · P5 adversarial review ·
P6 locked-test integrity · P7 held-out regression. Code is gated by these; never bypass them.

## The autonomous pipeline (per issue)
`branch → plan → work → commit → pr → review → evidence → merge → cleanup`. The planner emits a plan,
the executor implements it in a git worktree, the gates decide, passing work squash-merges to main.

## When you change a command's behavior
Add or update its **locked acceptance test** in `test/protocol.test.mjs` (gate tests) or
`test/pipeline.test.mjs` (pipeline tests) and make `node --test` green — that suite IS the contract.
