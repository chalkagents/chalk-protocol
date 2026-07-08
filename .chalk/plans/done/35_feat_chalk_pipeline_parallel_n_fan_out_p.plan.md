---
generator: chalk-protocol
id: "task-cac4cb76"
name: "feat: chalk pipeline --parallel N — fan out per-task stage chains in worktrees, serialize merges at the gate (#110 slice 3)"
overview: "chalk pipeline --parallel N runs up to N per-task chains (branch..evidence) concurrently, each in its own worktree, and never exceeds N in flight; every queued issue-backed task is chained (none dropped by the pool)"
created: "2026-07-08T15:46:44.493Z"
todos:
  - id: "task-cac4cb76-c1"
    content: "chalk pipeline --parallel N runs up to N per-task chains (branch..evidence) concurrently, each in its own worktree, and never exceeds N in flight; every queued issue-backed task is chained (none dropped by the pool)"
    status: done
  - id: "task-cac4cb76-c2"
    content: "Merges are SERIALIZED — never concurrent — because they squash onto the shared base branch and contend; a chain that reaches the merge point cleanly is merged, and the git/gh stage runners are injectable so these invariants are testable without a live repo"
    status: done
  - id: "task-cac4cb76-c3"
    content: "A chain that blocks (non-zero) is NOT merged and is reported blocked; a merge that fails blocks that task; the sequential chalk pipeline (no --parallel) path is unchanged"
    status: done
---

# feat: chalk pipeline --parallel N — fan out per-task stage chains in worktrees, serialize merges at the gate (#110 slice 3)

> state: **done** · phase: discovery

## Objective

- chalk pipeline --parallel N runs up to N per-task chains (branch..evidence) concurrently, each in its own worktree, and never exceeds N in flight; every queued issue-backed task is chained (none dropped by the pool)
- Merges are SERIALIZED — never concurrent — because they squash onto the shared base branch and contend; a chain that reaches the merge point cleanly is merged, and the git/gh stage runners are injectable so these invariants are testable without a live repo
- A chain that blocks (non-zero) is NOT merged and is reported blocked; a merge that fails blocks that task; the sequential chalk pipeline (no --parallel) path is unchanged

## Locked tests (read-only — P6)

- `test/pipeline-parallel.test.mjs`

## Reviews

- **block** · 2026-07-08T16:37 · adversary
- **pass** · 2026-07-08T16:44 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
