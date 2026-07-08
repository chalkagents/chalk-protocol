---
generator: chalk-protocol
id: "task-f8647c91"
name: "fix: chalk spec --test from a linked worktree records a '../<worktree>/…' lock path — dead after cleanup"
overview: "chalk spec --test <path> and chalk amend-spec --test <path> invoked from a linked git worktree record the lock 'path' relative to the worktree's copy of the project root (tree-relative, e.g. test/x.mjs) — never a '../<worktree>/…' path that points into the worktree and dies after chalk merge cleans it up"
created: "2026-07-07T09:50:24.970Z"
todos:
  - id: "task-f8647c91-c1"
    content: "chalk spec --test <path> and chalk amend-spec --test <path> invoked from a linked git worktree record the lock 'path' relative to the worktree's copy of the project root (tree-relative, e.g. test/x.mjs) — never a '../<worktree>/…' path that points into the worktree and dies after chalk merge cleans it up"
    status: done
  - id: "task-f8647c91-c2"
    content: "The recorded tree-relative path resolves under the canonical spine root as well (survives worktree cleanup): store.brokenLocks against the canonical root finds the file when it exists there and reports no false integrity break"
    status: done
  - id: "task-f8647c91-c3"
    content: "From the canonical root (not inside a linked worktree) the recorded lock path is unchanged — still relative to the spine root — so no existing lock is rewritten; a monorepo subdir offset is preserved"
    status: done
---

# fix: chalk spec --test from a linked worktree records a '../<worktree>/…' lock path — dead after cleanup

> state: **done** · phase: discovery

## Objective

- chalk spec --test <path> and chalk amend-spec --test <path> invoked from a linked git worktree record the lock 'path' relative to the worktree's copy of the project root (tree-relative, e.g. test/x.mjs) — never a '../<worktree>/…' path that points into the worktree and dies after chalk merge cleans it up
- The recorded tree-relative path resolves under the canonical spine root as well (survives worktree cleanup): store.brokenLocks against the canonical root finds the file when it exists there and reports no false integrity break
- From the canonical root (not inside a linked worktree) the recorded lock path is unchanged — still relative to the spine root — so no existing lock is rewritten; a monorepo subdir offset is preserved

## Locked tests (read-only — P6)

- `test/spec-worktree-lockpath.test.mjs`

## Reviews

- **pass** · 2026-07-08T15:01 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
