---
generator: chalk-protocol
id: "task-b76c80e5"
name: "fix: chalk review retries once on a transient reviewer failure (match the pipeline stage)"
overview: "chalk review retries the reviewer once when the first attempt returns no valid verdict (transient failure), and accepts a valid verdict from the retry"
created: "2026-07-01T03:42:30.832Z"
todos:
  - id: "task-b76c80e5-c1"
    content: "chalk review retries the reviewer once when the first attempt returns no valid verdict (transient failure), and accepts a valid verdict from the retry"
    status: done
  - id: "task-b76c80e5-c2"
    content: "only a second consecutive error is fatal"
    status: done
---

# fix: chalk review retries once on a transient reviewer failure (match the pipeline stage)

> state: **done** · phase: discovery

## Objective

- chalk review retries the reviewer once when the first attempt returns no valid verdict (transient failure), and accepts a valid verdict from the retry
- only a second consecutive error is fatal

## Locked tests (read-only — P6)

- `test/review-retry.test.mjs`

## Reviews

- **pass** · 2026-07-01T03:49 · adversary
- **stale** · 2026-07-01T03:50 · amend-spec
- **pass** · 2026-07-01T03:58 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
