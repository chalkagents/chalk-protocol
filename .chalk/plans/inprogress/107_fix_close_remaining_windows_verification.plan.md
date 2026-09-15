---
generator: chalk-protocol
id: "task-c52e6997"
name: "fix: close remaining Windows verification regressions"
overview: "Windows verification detects transient ancestor repository selectors, ignore policies, source membership, and symlink changes without false positives for stable ignored output."
created: "2026-09-15T14:59:29.073Z"
todos:
  - id: "task-c52e6997-c1"
    content: "Windows verification detects transient ancestor repository selectors, ignore policies, source membership, and symlink changes without false positives for stable ignored output."
    status: pending
  - id: "task-c52e6997-c2"
    content: "Windows verification finalizes evidence without held filesystem handles and owns command descendants through normal completion, timeout, interruption, and capture failure."
    status: pending
  - id: "task-c52e6997-c3"
    content: "The focused Windows verification regression job and the full Ubuntu, minimum-Node, and Windows CI matrix are green."
    status: pending
---

# fix: close remaining Windows verification regressions

> state: **in-progress** · phase: discovery

## Objective

- Windows verification detects transient ancestor repository selectors, ignore policies, source membership, and symlink changes without false positives for stable ignored output.
- Windows verification finalizes evidence without held filesystem handles and owns command descendants through normal completion, timeout, interruption, and capture failure.
- The focused Windows verification regression job and the full Ubuntu, minimum-Node, and Windows CI matrix are green.

## Locked tests (read-only — P6)

- `test/verification-absent-membership.test.mjs`
- `test/verification-lifecycle-continuity.test.mjs`
- `test/verification-repository-selection.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
