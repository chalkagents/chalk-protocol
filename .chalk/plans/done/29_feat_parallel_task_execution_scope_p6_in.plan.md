---
generator: chalk-protocol
id: "task-96eabc01"
name: "feat: parallel task execution — scope P6 integrity per worktree, lock spine writes, fan out the driver"
overview: "verify() checks each in-progress task's locked tests against THAT task's own worktree (task.worktree, falling back to store.root) instead of one shared cwd — so a second in-progress task on its own branch no longer trips a false P6 integrity break in the first task's checkout"
created: "2026-07-07T09:50:24.971Z"
todos:
  - id: "task-96eabc01-c1"
    content: "verify() checks each in-progress task's locked tests against THAT task's own worktree (task.worktree, falling back to store.root) instead of one shared cwd — so a second in-progress task on its own branch no longer trips a false P6 integrity break in the first task's checkout"
    status: done
  - id: "task-96eabc01-c2"
    content: "Single in-progress task behavior is unchanged: when the task's worktree equals the verify cwd (the common case), the integrity result is byte-identical to today"
    status: done
  - id: "task-96eabc01-c3"
    content: "The opt-in all-locks DONE-task integrity check still runs against the verify cwd (the current worktree), preserving the #80 anti-cheat that catches the current task weakening an already-done task's locked test"
    status: done
---

# feat: parallel task execution — scope P6 integrity per worktree, lock spine writes, fan out the driver

> state: **done** · phase: discovery

## Objective

- verify() checks each in-progress task's locked tests against THAT task's own worktree (task.worktree, falling back to store.root) instead of one shared cwd — so a second in-progress task on its own branch no longer trips a false P6 integrity break in the first task's checkout
- Single in-progress task behavior is unchanged: when the task's worktree equals the verify cwd (the common case), the integrity result is byte-identical to today
- The opt-in all-locks DONE-task integrity check still runs against the verify cwd (the current worktree), preserving the #80 anti-cheat that catches the current task weakening an already-done task's locked test

## Locked tests (read-only — P6)

- `test/verify-per-worktree-integrity.test.mjs`

## Reviews

- **pass** · 2026-07-08T15:51 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
