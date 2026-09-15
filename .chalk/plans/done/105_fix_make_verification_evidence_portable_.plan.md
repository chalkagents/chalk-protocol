---
generator: chalk-protocol
id: "task-c1114f1f"
name: "fix: make verification evidence portable on Windows"
overview: "Verification detects temporary Git repository, ignore-policy, source-file, and symlink changes on Windows without losing path identity or holding repository selectors open."
created: "2026-09-15T13:50:57.375Z"
todos:
  - id: "task-c1114f1f-c1"
    content: "Verification detects temporary Git repository, ignore-policy, source-file, and symlink changes on Windows without losing path identity or holding repository selectors open."
    status: done
  - id: "task-c1114f1f-c2"
    content: "Verification retains complete stdout and stderr and terminates or drains descendant processes on Windows for normal completion, timeout, and interruption."
    status: done
  - id: "task-c1114f1f-c3"
    content: "The Ubuntu, Windows, and minimum Node CI matrix passes without weakening fail-closed verification assertions."
    status: done
---

# fix: make verification evidence portable on Windows

> state: **done** · phase: discovery

## Objective

- Verification detects temporary Git repository, ignore-policy, source-file, and symlink changes on Windows without losing path identity or holding repository selectors open.
- Verification retains complete stdout and stderr and terminates or drains descendant processes on Windows for normal completion, timeout, and interruption.
- The Ubuntu, Windows, and minimum Node CI matrix passes without weakening fail-closed verification assertions.

## Locked tests (read-only — P6)

- `test/verification-absent-membership.test.mjs`
- `test/verification-capture-authority.test.mjs`
- `test/verification-descriptor-budget.test.mjs`
- `test/verification-git-paths.test.mjs`
- `test/verification-lifecycle-continuity.test.mjs`
- `test/verification-lifecycle.test.mjs`
- `test/verification-literal-boundaries.test.mjs`
- `test/verification-policy-authorities.test.mjs`
- `test/verification-record.test.mjs`
- `test/verification-repository-selection.test.mjs`
- `test/verification-stream-policy.test.mjs`
- `test/verification-supervision.test.mjs`
- `test/verification-symlink-metadata.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
