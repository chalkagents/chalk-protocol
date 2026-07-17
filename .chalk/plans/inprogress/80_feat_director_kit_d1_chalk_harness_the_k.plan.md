---
generator: chalk-protocol
id: "task-225f6a98"
name: "feat(director-kit): D1 · chalk harness — the kit made visible"
overview: "chalk harness shows the four parts of the kit — Agents, Skills, Checks, Flows — in one read-only view"
created: "2026-07-17T12:22:11.123Z"
todos:
  - id: "task-225f6a98-c1"
    content: "chalk harness shows the four parts of the kit — Agents, Skills, Checks, Flows — in one read-only view"
    status: pending
  - id: "task-225f6a98-c2"
    content: "It reflects actual config: wired agents show their command / unwired show '(not wired)'; configured verify + wired review show as on; project skills (#215) are surfaced"
    status: pending
  - id: "task-225f6a98-c3"
    content: "A bare project still renders coherently (none/off states, no crash) — reinforcing the parts are composable, not mandatory"
    status: pending
  - id: "task-225f6a98-c4"
    content: "chalk harness is READ-ONLY — it mutates no spine state"
    status: pending
---

# feat(director-kit): D1 · chalk harness — the kit made visible

> state: **in-progress** · phase: discovery

## Objective

- chalk harness shows the four parts of the kit — Agents, Skills, Checks, Flows — in one read-only view
- It reflects actual config: wired agents show their command / unwired show '(not wired)'; configured verify + wired review show as on; project skills (#215) are surfaced
- A bare project still renders coherently (none/off states, no crash) — reinforcing the parts are composable, not mandatory
- chalk harness is READ-ONLY — it mutates no spine state

## Locked tests (read-only — P6)

- `test/director-harness.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
