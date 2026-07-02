---
generator: chalk-protocol
id: "task-30543dfd"
name: "feat: merge gate requires recording + LGTM + broke-check, then merges"
overview: "lib/mergegate.mjs exports mergeBlockers(store, task, {reviewRequired, broke}) returning an array of human-readable blocking reasons (empty = clear to merge)"
created: "2026-06-28T17:14:58.646Z"
todos:
  - id: "task-30543dfd-c1"
    content: "lib/mergegate.mjs exports mergeBlockers(store, task, {reviewRequired, broke}) returning an array of human-readable blocking reasons (empty = clear to merge)"
    status: done
  - id: "task-30543dfd-c2"
    content: "mergeBlockers blocks when: broke-check not ok, no recording (hasRecording false), or review required and (no passing review OR no LGTM on the PR)"
    status: done
  - id: "task-30543dfd-c3"
    content: "chalk merge replaces the bare verify gate with brokeCheck (remote CI if present, else local verify) and blocks on mergeBlockers with a diagnosable reason"
    status: done
  - id: "task-30543dfd-c4"
    content: "when review is required and the review passed but no LGTM is surfaced, chalk merge posts the LGTM to the PR before merging"
    status: done
  - id: "task-30543dfd-c5"
    content: "ciStatus treats a non-checks JSON payload (elements without a string bucket) as 'none' so a stubbed/garbage gh response falls back to local verify"
    status: done
  - id: "task-30543dfd-c6"
    content: "existing gates preserved (in-progress, PR exists, held-out audit P7, idempotent resume) and the full pipeline still merges end-to-end"
    status: done
---

# feat: merge gate requires recording + LGTM + broke-check, then merges

> state: **done** · phase: discovery

## Objective

- lib/mergegate.mjs exports mergeBlockers(store, task, {reviewRequired, broke}) returning an array of human-readable blocking reasons (empty = clear to merge)
- mergeBlockers blocks when: broke-check not ok, no recording (hasRecording false), or review required and (no passing review OR no LGTM on the PR)
- chalk merge replaces the bare verify gate with brokeCheck (remote CI if present, else local verify) and blocks on mergeBlockers with a diagnosable reason
- when review is required and the review passed but no LGTM is surfaced, chalk merge posts the LGTM to the PR before merging
- ciStatus treats a non-checks JSON payload (elements without a string bucket) as 'none' so a stubbed/garbage gh response falls back to local verify
- existing gates preserved (in-progress, PR exists, held-out audit P7, idempotent resume) and the full pipeline still merges end-to-end

## Locked tests (read-only — P6)

- `test/mergegate.test.mjs`

## Reviews

- **block** · 2026-06-28T17:48 · adversary
- **pass** · 2026-06-28T17:51 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
