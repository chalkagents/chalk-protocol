---
generator: chalk-protocol
id: "task-124fde8a"
name: "fix: chalk review advances pipeline.stage to 'reviewed' even when no PR exists — manual-order review pollutes the commit/pr stage guards"
overview: "`chalk review` should only advance the stage when the task is actually past pr-open (or track review separately from the pipeline progression)"
created: "2026-07-06T09:17:15.836Z"
todos:
  - id: "task-124fde8a-c1"
    content: "`chalk review` should only advance the stage when the task is actually past pr-open (or track review separately from the pipeline progression)"
    status: done
  - id: "task-124fde8a-c2"
    content: "`chalk pr`'s already-open path should not report success when `t.pr` is null/number-less"
    status: done
---

# fix: chalk review advances pipeline.stage to 'reviewed' even when no PR exists — manual-order review pollutes the commit/pr stage guards

> state: **done** · phase: discovery

## Objective

- `chalk review` should only advance the stage when the task is actually past pr-open (or track review separately from the pipeline progression)
- `chalk pr`'s already-open path should not report success when `t.pr` is null/number-less

## Locked tests (read-only — P6)

- `test/review-stage-order.test.mjs`

## Reviews

- **pass** · 2026-07-06T09:22 · adversary
- **stale** · 2026-07-06T09:22 · amend-spec
- **pass** · 2026-07-06T09:24 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
