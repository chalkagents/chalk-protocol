---
generator: chalk-protocol
id: "task-ae0148d8"
name: "fix: passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task"
overview: "A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step"
created: "2026-07-07T09:50:24.966Z"
todos:
  - id: "task-ae0148d8-c1"
    content: "A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step"
    status: done
  - id: "task-ae0148d8-c2"
    content: "Locked test drives the full round trip: run-loop review block → fix → `chalk review` pass → task is runnable again without manual state surgery"
    status: done
  - id: "task-ae0148d8-c3"
    content: "`chalk done` succeeds after that round trip (no residual blocked-state gate failure)"
    status: done
  - id: "task-ae0148d8-c4"
    content: "A passing chalk review (adversarial or manual) on a task blocked with needs:review auto-unblocks it: restores blockedFrom, clears t.block, and announces it — so runnableTasks stops skipping it."
    status: done
  - id: "task-ae0148d8-c5"
    content: "A non-review block (needs: human-input/creds/decision/upstream) is a real dependency and is NEVER cleared by a passing review."
    status: done
  - id: "task-ae0148d8-c6"
    content: "Locked test drives the full round trip: run-loop review block → fix → chalk review pass → task runnable again → chalk done succeeds, with no manual state surgery."
    status: done
---

# fix: passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task

> state: **done** · phase: discovery

## Objective

- A passing `chalk review` on a task blocked with `needs:review` auto-unblocks it (restore `blockedFrom`, clear `t.block`), or the review-blocked guidance in next/status/backlog explicitly includes the `chalk unblock` step
- Locked test drives the full round trip: run-loop review block → fix → `chalk review` pass → task is runnable again without manual state surgery
- `chalk done` succeeds after that round trip (no residual blocked-state gate failure)
- A passing chalk review (adversarial or manual) on a task blocked with needs:review auto-unblocks it: restores blockedFrom, clears t.block, and announces it — so runnableTasks stops skipping it.
- A non-review block (needs: human-input/creds/decision/upstream) is a real dependency and is NEVER cleared by a passing review.
- Locked test drives the full round trip: run-loop review block → fix → chalk review pass → task runnable again → chalk done succeeds, with no manual state surgery.

## Locked tests (read-only — P6)

- `test/review-unblock.test.mjs`

## Reviews

- **pass** · 2026-07-07T10:05 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
