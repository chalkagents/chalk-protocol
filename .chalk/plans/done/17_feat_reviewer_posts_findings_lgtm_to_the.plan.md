---
generator: chalk-protocol
id: "task-e1a9cb7d"
name: "feat: reviewer posts findings + LGTM to the remote PR"
overview: "lib/prreview.mjs exports postReviewToPr(store, task, {verdict, findings}) and reviewComment({verdict, findings})"
created: "2026-06-28T17:14:58.551Z"
todos:
  - id: "task-e1a9cb7d-c1"
    content: "lib/prreview.mjs exports postReviewToPr(store, task, {verdict, findings}) and reviewComment({verdict, findings})"
    status: done
  - id: "task-e1a9cb7d-c2"
    content: "reviewComment renders an LGTM-marked comment on pass and a findings list (severity/area/note) on block"
    status: done
  - id: "task-e1a9cb7d-c3"
    content: "postReviewToPr posts the comment to the task's PR via gh pr comment --body-file -; no PR or no gh configured → no-op returning {posted:false}; a gh failure is swallowed (never crashes the review)"
    status: done
  - id: "task-e1a9cb7d-c4"
    content: "chalk review posts the verdict to the PR after computing it and sets task.pr.lgtm=true on a passing post (the merge-gate hook)"
    status: done
  - id: "task-e1a9cb7d-c5"
    content: "the chalk run loop's review also posts to the PR when the task has one"
    status: done
---

# feat: reviewer posts findings + LGTM to the remote PR

> state: **done** · phase: discovery

## Objective

- lib/prreview.mjs exports postReviewToPr(store, task, {verdict, findings}) and reviewComment({verdict, findings})
- reviewComment renders an LGTM-marked comment on pass and a findings list (severity/area/note) on block
- postReviewToPr posts the comment to the task's PR via gh pr comment --body-file -; no PR or no gh configured → no-op returning {posted:false}; a gh failure is swallowed (never crashes the review)
- chalk review posts the verdict to the PR after computing it and sets task.pr.lgtm=true on a passing post (the merge-gate hook)
- the chalk run loop's review also posts to the PR when the task has one

## Locked tests (read-only — P6)

- `test/prreview.test.mjs`

## Reviews

- **pass** · 2026-06-28T17:31 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
