---
generator: chalk-protocol
id: "task-3846b6a0"
name: "fix: merge ff-pull failure strands a stale base — chalk branch cuts from the fresh remote base (#150)"
overview: "chalk branch cuts the new worktree from the FRESH remote base (origin/<base>, after a best-effort fetch), so a stale local base (behind the remote — e.g. after a failed merge pull --ff-only) does not strand the next task on old code: the worktree contains the remote's latest commits"
created: "2026-07-08T17:39:32.785Z"
todos:
  - id: "task-3846b6a0-c1"
    content: "chalk branch cuts the new worktree from the FRESH remote base (origin/<base>, after a best-effort fetch), so a stale local base (behind the remote — e.g. after a failed merge pull --ff-only) does not strand the next task on old code: the worktree contains the remote's latest commits"
    status: done
  - id: "task-3846b6a0-c2"
    content: "When origin/<base> cannot be resolved (no remote / offline), branch falls back to the local base and warns if a remote exists — never SILENTLY stale; the merge itself still completes (remote is source of truth), unchanged"
    status: done
  - id: "task-3846b6a0-c3"
    content: "The normal case (local base already current) is unaffected — the worktree is cut from the base tip as before"
    status: done
---

# fix: merge ff-pull failure strands a stale base — chalk branch cuts from the fresh remote base (#150)

> state: **done** · phase: discovery

## Objective

- chalk branch cuts the new worktree from the FRESH remote base (origin/<base>, after a best-effort fetch), so a stale local base (behind the remote — e.g. after a failed merge pull --ff-only) does not strand the next task on old code: the worktree contains the remote's latest commits
- When origin/<base> cannot be resolved (no remote / offline), branch falls back to the local base and warns if a remote exists — never SILENTLY stale; the merge itself still completes (remote is source of truth), unchanged
- The normal case (local base already current) is unaffected — the worktree is cut from the base tip as before

## Locked tests (read-only — P6)

- `test/branch-fresh-base.test.mjs`

## Reviews

- **block** · 2026-07-08T17:43 · adversary
- **pass** · 2026-07-08T17:47 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
