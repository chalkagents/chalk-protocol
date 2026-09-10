---
generator: chalk-protocol
id: "task-6285aa3f"
name: "fix: preserve newer review findings during task saves"
overview: "A whole-task save cannot erase or replace a newer recorded review verdict, findings or approval; stale saves fail with a recovery command."
created: "2026-09-10T00:17:25.631Z"
todos:
  - id: "task-6285aa3f-c1"
    content: "A whole-task save cannot erase or replace a newer recorded review verdict, findings or approval; stale saves fail with a recovery command."
    status: pending
  - id: "task-6285aa3f-c2"
    content: "Normal review appends and director decision annotations remain supported. A regression drives the real planner-save path after an intervening BLOCK."
    status: pending
---

# fix: preserve newer review findings during task saves

> state: **blocked** · phase: discovery

## Objective

- A whole-task save cannot erase or replace a newer recorded review verdict, findings or approval; stale saves fail with a recovery command.
- Normal review appends and director decision annotations remain supported. A regression drives the real planner-save path after an intervening BLOCK.

## Locked tests (read-only — P6)

- `test/review-history-save.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
