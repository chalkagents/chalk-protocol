---
generator: chalk-protocol
id: "task-3a49d957"
name: "feat(director-loop): A1 · redirect re-opens the task as an actionable directive"
overview: "chalk pending redirect records a durable directive on the task (t.directives[] = { choice, instead, at, by, resolved:false }) — the correction becomes actionable work, not just a log line"
created: "2026-07-17T09:32:56.704Z"
todos:
  - id: "task-3a49d957-c1"
    content: "chalk pending redirect records a durable directive on the task (t.directives[] = { choice, instead, at, by, resolved:false }) — the correction becomes actionable work, not just a log line"
    status: done
  - id: "task-3a49d957-c2"
    content: "Redirecting a DONE task re-opens it to in-progress (reopenedAt stamped) so it can be reworked to the director's call"
    status: done
  - id: "task-3a49d957-c3"
    content: "Redirecting a non-done (already active) task keeps its state and only attaches the directive (no spurious re-open)"
    status: done
  - id: "task-3a49d957-c4"
    content: "accept does NOT create a directive or re-open the task — only redirect re-directs"
    status: done
---

# feat(director-loop): A1 · redirect re-opens the task as an actionable directive

> state: **done** · phase: discovery

## Objective

- chalk pending redirect records a durable directive on the task (t.directives[] = { choice, instead, at, by, resolved:false }) — the correction becomes actionable work, not just a log line
- Redirecting a DONE task re-opens it to in-progress (reopenedAt stamped) so it can be reworked to the director's call
- Redirecting a non-done (already active) task keeps its state and only attaches the directive (no spurious re-open)
- accept does NOT create a directive or re-open the task — only redirect re-directs

## Locked tests (read-only — P6)

- `test/director-reopen.test.mjs`

## Reviews

- **pass** · 2026-07-17T09:59 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
