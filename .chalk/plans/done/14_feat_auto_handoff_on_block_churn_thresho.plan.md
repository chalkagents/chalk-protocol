---
generator: chalk-protocol
id: "task-58ea7e15"
name: "feat: auto-handoff on block + churn-threshold handoff"
overview: "chalk block <id> writes a handoff (reason=needs, note=the block reason) and records task.handoff — so the pipeline's auto-block, which shells out to chalk block, is covered too"
created: "2026-06-28T16:41:18.259Z"
todos:
  - id: "task-58ea7e15-c1"
    content: "chalk block <id> writes a handoff (reason=needs, note=the block reason) and records task.handoff — so the pipeline's auto-block, which shells out to chalk block, is covered too"
    status: done
  - id: "task-58ea7e15-c2"
    content: "the chalk run loop's auto-block (blockTask) also writes a handoff for the blocked task"
    status: done
  - id: "task-58ea7e15-c3"
    content: "each work attempt increments task.attempts — in both chalk work and the run-loop executor"
    status: done
  - id: "task-58ea7e15-c4"
    content: "lib/handoff.mjs exports overAttemptBudget(store, task) = task.attempts >= protocol.handoff.maxAttempts"
    status: done
  - id: "task-58ea7e15-c5"
    content: "when attempts reach maxAttempts and verify is still red, the run loop auto-blocks with a churn reason that recommends a fresh session"
    status: done
---

# feat: auto-handoff on block + churn-threshold handoff

> state: **done** · phase: discovery

## Objective

- chalk block <id> writes a handoff (reason=needs, note=the block reason) and records task.handoff — so the pipeline's auto-block, which shells out to chalk block, is covered too
- the chalk run loop's auto-block (blockTask) also writes a handoff for the blocked task
- each work attempt increments task.attempts — in both chalk work and the run-loop executor
- lib/handoff.mjs exports overAttemptBudget(store, task) = task.attempts >= protocol.handoff.maxAttempts
- when attempts reach maxAttempts and verify is still red, the run loop auto-blocks with a churn reason that recommends a fresh session

## Locked tests (read-only — P6)

- `test/handoff-triggers.test.mjs`

## Reviews

- **pass** · 2026-06-28T16:53 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
