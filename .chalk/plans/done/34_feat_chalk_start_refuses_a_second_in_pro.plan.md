---
generator: chalk-protocol
id: "task-a111bb0a"
name: "feat: chalk start refuses a second in-progress task unless protocol.parallel.enabled — make the one-at-a-time convention a hard gate (#110 slice 4)"
overview: "chalk start <id> refuses with a non-zero exit when another task is already in-progress and parallel mode is off; the task is NOT moved to in-progress, and the error names the blocking task and how to opt in"
created: "2026-07-08T15:46:44.409Z"
todos:
  - id: "task-a111bb0a-c1"
    content: "chalk start <id> refuses with a non-zero exit when another task is already in-progress and parallel mode is off; the task is NOT moved to in-progress, and the error names the blocking task and how to opt in"
    status: done
  - id: "task-a111bb0a-c2"
    content: "With protocol.parallel.enabled=true (or the --parallel flag) chalk start allows a second concurrent in-progress task"
    status: done
  - id: "task-a111bb0a-c3"
    content: "The gate does not fire when there is no other in-progress task (starting the first task) nor when re-running start on the already-in-progress task itself"
    status: done
---

# feat: chalk start refuses a second in-progress task unless protocol.parallel.enabled — make the one-at-a-time convention a hard gate (#110 slice 4)

> state: **done** · phase: discovery

## Objective

- chalk start <id> refuses with a non-zero exit when another task is already in-progress and parallel mode is off; the task is NOT moved to in-progress, and the error names the blocking task and how to opt in
- With protocol.parallel.enabled=true (or the --parallel flag) chalk start allows a second concurrent in-progress task
- The gate does not fire when there is no other in-progress task (starting the first task) nor when re-running start on the already-in-progress task itself

## Locked tests (read-only — P6)

- `test/start-single-wip-gate.test.mjs`

## Reviews

- **pass** · 2026-07-08T15:57 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
