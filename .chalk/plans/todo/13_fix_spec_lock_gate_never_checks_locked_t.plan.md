---
generator: chalk-protocol
id: "task-8189ac26"
name: "fix: spec-lock gate never checks locked tests are tracked in git — a pinned test can ship untracked and CI runs a vacuous green"
overview: "`chalk done` (and/or `chalk pr`) verifies every locked test path pinned in the task spec is tracked (`git ls-files`) in the task's worktree, and fails with an error naming the untracked path(s)"
created: "2026-07-06T10:05:49.978Z"
todos:
  - id: "task-8189ac26-c1"
    content: "`chalk done` (and/or `chalk pr`) verifies every locked test path pinned in the task spec is tracked (`git ls-files`) in the task's worktree, and fails with an error naming the untracked path(s)"
    status: pending
  - id: "task-8189ac26-c2"
    content: "the error message suggests the fix (`git add <path>` / re-run `chalk commit`)"
    status: pending
  - id: "task-8189ac26-c3"
    content: "locked test: `chalk done` refuses when a pinned test file exists on disk but is untracked, and succeeds once the file is tracked"
    status: pending
---

# fix: spec-lock gate never checks locked tests are tracked in git — a pinned test can ship untracked and CI runs a vacuous green

> state: **specd** · phase: discovery

## Objective

- `chalk done` (and/or `chalk pr`) verifies every locked test path pinned in the task spec is tracked (`git ls-files`) in the task's worktree, and fails with an error naming the untracked path(s)
- the error message suggests the fix (`git add <path>` / re-run `chalk commit`)
- locked test: `chalk done` refuses when a pinned test file exists on disk but is untracked, and succeeds once the file is tracked

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
