---
generator: chalk-protocol
id: "task-ae0148d8"
name: "fix: passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task"
overview: "A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step"
created: "2026-07-07T09:50:24.966Z"
todos:
  - id: "task-ae0148d8-c1"
    content: "A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step"
    status: pending
  - id: "task-ae0148d8-c2"
    content: "Locked test drives the full round trip: run-loop review block → fix → `chalk review` pass → task is runnable again without manual state surgery"
    status: pending
  - id: "task-ae0148d8-c3"
    content: "`chalk done` succeeds after that round trip (no residual blocked-state gate failure)"
    status: pending
---

# fix: passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task

> state: **specd** · phase: discovery

## Objective

- A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step
- Locked test drives the full round trip: run-loop review block → fix → `chalk review` pass → task is runnable again without manual state surgery
- `chalk done` succeeds after that round trip (no residual blocked-state gate failure)

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
