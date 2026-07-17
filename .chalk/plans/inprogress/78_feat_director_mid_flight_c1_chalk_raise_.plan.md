---
generator: chalk-protocol
id: "task-d3cfdb8f"
name: "feat(director-mid-flight): C1 · chalk raise — the mid-flight raise primitive"
overview: "chalk raise \"<fork>\" [--options a|b|c] [--why ...] [--task <id>] records a raise on the target task's t.raised[]: {id, fork, options?, why?, at, by:'agent', status:'open'}"
created: "2026-07-17T10:59:50.218Z"
todos:
  - id: "task-d3cfdb8f-c1"
    content: "chalk raise \"<fork>\" [--options a|b|c] [--why ...] [--task <id>] records a raise on the target task's t.raised[]: {id, fork, options?, why?, at, by:'agent', status:'open'}"
    status: pending
  - id: "task-d3cfdb8f-c2"
    content: "Defaults to the current in-progress task; refuses cleanly when there is none and no --task"
    status: pending
  - id: "task-d3cfdb8f-c3"
    content: "options parse from a pipe-delimited list; chalk raise with no fork text lists the open raised forks; openRaises(task) accessor returns only open raises"
    status: pending
---

# feat(director-mid-flight): C1 · chalk raise — the mid-flight raise primitive

> state: **in-progress** · phase: discovery

## Objective

- chalk raise "<fork>" [--options a|b|c] [--why ...] [--task <id>] records a raise on the target task's t.raised[]: {id, fork, options?, why?, at, by:'agent', status:'open'}
- Defaults to the current in-progress task; refuses cleanly when there is none and no --task
- options parse from a pipe-delimited list; chalk raise with no fork text lists the open raised forks; openRaises(task) accessor returns only open raises

## Locked tests (read-only — P6)

- `test/director-raise.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
