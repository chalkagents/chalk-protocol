---
generator: chalk-protocol
id: "task-daa45169"
name: "fix: review diff-capture silently passes on no diff — abort loudly instead of a vacuous verdict (#151)"
overview: "When captureDiff yields an empty diff (all git-diff strategies produce nothing), runReview returns a distinct 'no-diff' status WITHOUT invoking the reviewer — so no pass/block verdict is fabricated over an empty change set"
created: "2026-07-08T17:09:32.745Z"
todos:
  - id: "task-daa45169-c1"
    content: "When captureDiff yields an empty diff (all git-diff strategies produce nothing), runReview returns a distinct 'no-diff' status WITHOUT invoking the reviewer — so no pass/block verdict is fabricated over an empty change set"
    status: done
  - id: "task-daa45169-c2"
    content: "chalk review aborts LOUDLY on the no-diff status: non-zero exit, a clear 'no diff captured' message, and NO passing review recorded on the task; it is not treated as a retryable transient error"
    status: done
  - id: "task-daa45169-c3"
    content: "A review WITH a real (non-empty) diff is unaffected — the normal pass/block flow and recorded verdict are unchanged"
    status: done
---

# fix: review diff-capture silently passes on no diff — abort loudly instead of a vacuous verdict (#151)

> state: **done** · phase: discovery

## Objective

- When captureDiff yields an empty diff (all git-diff strategies produce nothing), runReview returns a distinct 'no-diff' status WITHOUT invoking the reviewer — so no pass/block verdict is fabricated over an empty change set
- chalk review aborts LOUDLY on the no-diff status: non-zero exit, a clear 'no diff captured' message, and NO passing review recorded on the task; it is not treated as a retryable transient error
- A review WITH a real (non-empty) diff is unaffected — the normal pass/block flow and recorded verdict are unchanged

## Locked tests (read-only — P6)

- `test/review-no-diff.test.mjs`

## Reviews

- **pass** · 2026-07-08T17:24 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
