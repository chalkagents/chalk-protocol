---
generator: chalk-protocol
id: "task-f68a76ae"
name: "fix: reviewer diffs against the LOCAL base first — a stale/divergent local dev balloons the review diff to the whole branch history; prefer origin/<base>"
overview: "captureDiff's strategy order prefers origin/<base>...HEAD over <base>...HEAD, so a stale/divergent local base branch can't balloon the review diff to the whole base-vs-trunk history"
created: "2026-07-13T04:09:13.672Z"
todos:
  - id: "task-f68a76ae-c1"
    content: "captureDiff's strategy order prefers origin/<base>...HEAD over <base>...HEAD, so a stale/divergent local base branch can't balloon the review diff to the whole base-vs-trunk history"
    status: done
  - id: "task-f68a76ae-c2"
    content: "The strategy list is exposed as a pure function (diffStrategies) and preserves working-tree-first + the branchless last-commit/empty-tree fallbacks after the base-relative diffs"
    status: done
---

# fix: reviewer diffs against the LOCAL base first — a stale/divergent local dev balloons the review diff to the whole branch history; prefer origin/<base>

> state: **done** · phase: discovery

## Objective

- captureDiff's strategy order prefers origin/<base>...HEAD over <base>...HEAD, so a stale/divergent local base branch can't balloon the review diff to the whole base-vs-trunk history
- The strategy list is exposed as a pure function (diffStrategies) and preserves working-tree-first + the branchless last-commit/empty-tree fallbacks after the base-relative diffs

## Locked tests (read-only — P6)

- `test/review-diff-base.test.mjs`

## Reviews

- **pass** · 2026-07-13T04:11 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
