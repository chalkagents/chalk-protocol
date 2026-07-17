---
generator: chalk-protocol
id: "task-5d2e2fbc"
name: "feat(director-mid-flight): C3 · raised forks pause the task + route to the inbox"
overview: "After a chalk work run, a task with OPEN raises does not proceed: chalk work exits 2 and the driver blocks it needs:decision — a guessed choice never ships past a raised fork"
created: "2026-07-17T10:59:50.208Z"
todos:
  - id: "task-5d2e2fbc-c1"
    content: "After a chalk work run, a task with OPEN raises does not proceed: chalk work exits 2 and the driver blocks it needs:decision — a guessed choice never ships past a raised fork"
    status: pending
  - id: "task-5d2e2fbc-c2"
    content: "chalk pending surfaces open raised forks (fork + options + why) across tasks, each with an answer ref"
    status: pending
  - id: "task-5d2e2fbc-c3"
    content: "chalk pending answer <raiseId> \"<decision>\" marks the raise answered, feeds the answer back as a directive (#199 channel so the next work rebuilds to it), compounds it to the durable director record (#201/#202), and unblocks a task parked on the raise"
    status: pending
  - id: "task-5d2e2fbc-c4"
    content: "Once the raise is answered, chalk work proceeds (no open raises left) — the mid-flight loop is closed"
    status: pending
---

# feat(director-mid-flight): C3 · raised forks pause the task + route to the inbox

> state: **in-progress** · phase: discovery

## Objective

- After a chalk work run, a task with OPEN raises does not proceed: chalk work exits 2 and the driver blocks it needs:decision — a guessed choice never ships past a raised fork
- chalk pending surfaces open raised forks (fork + options + why) across tasks, each with an answer ref
- chalk pending answer <raiseId> "<decision>" marks the raise answered, feeds the answer back as a directive (#199 channel so the next work rebuilds to it), compounds it to the durable director record (#201/#202), and unblocks a task parked on the raise
- Once the raise is answered, chalk work proceeds (no open raises left) — the mid-flight loop is closed

## Locked tests (read-only — P6)

- `test/director-raise-route.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
