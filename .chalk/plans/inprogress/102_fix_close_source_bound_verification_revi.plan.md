---
generator: chalk-protocol
id: "task-42b79111"
name: "fix: close source-bound verification review gaps"
overview: "Git pathname discovery preserves arbitrary non-NUL path bytes losslessly or fails closed with unknown source identity; it never hashes a replacement-character pathname."
created: "2026-09-11T01:59:00.214Z"
todos:
  - id: "task-42b79111-c1"
    content: "Git pathname discovery preserves arbitrary non-NUL path bytes losslessly or fails closed with unknown source identity; it never hashes a replacement-character pathname."
    status: pending
  - id: "task-42b79111-c2"
    content: "Automated chalk work and chalk run verification paths create the same source-bound receipt evidence as direct verify and done without bypassing freshness gates."
    status: pending
  - id: "task-42b79111-c3"
    content: "Verification monitoring remains operational within a 256-descriptor process limit for repositories with at least 200 source directories."
    status: pending
  - id: "task-42b79111-c4"
    content: "If Git ignore policy changes between classification queries, verification conservatively records the changed path as stale without treating the resolved race as an observer failure."
    status: pending
  - id: "task-42b79111-c5"
    content: "The default verification command deadline accommodates the repository's source-bound self-verification suite without weakening per-test timeouts or freshness enforcement."
    status: pending
---

# fix: close source-bound verification review gaps

> state: **in-progress** · phase: discovery

## Objective

- Git pathname discovery preserves arbitrary non-NUL path bytes losslessly or fails closed with unknown source identity; it never hashes a replacement-character pathname.
- Automated chalk work and chalk run verification paths create the same source-bound receipt evidence as direct verify and done without bypassing freshness gates.
- Verification monitoring remains operational within a 256-descriptor process limit for repositories with at least 200 source directories.
- If Git ignore policy changes between classification queries, verification conservatively records the changed path as stale without treating the resolved race as an observer failure.
- The default verification command deadline accommodates the repository's source-bound self-verification suite without weakening per-test timeouts or freshness enforcement.

## Locked tests (read-only — P6)

- `test/verification-nonutf8-git-paths.test.mjs`
- `test/verification-automated-callers.test.mjs`
- `test/verification-descriptor-budget.test.mjs`
- `test/verification-ignore-race.test.mjs`
- `test/verification-default-timeout.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
