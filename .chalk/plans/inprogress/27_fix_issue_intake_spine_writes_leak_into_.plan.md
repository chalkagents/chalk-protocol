---
generator: chalk-protocol
id: "task-068a83c8"
name: "fix: issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise"
overview: "Issue import commits its spine changes (tasks.json entries, board rows) to the base branch in a dedicated chore(spine) commit before any task branch is cut, or the task commit stage excludes spine entries not belonging to the current task"
created: "2026-07-07T09:50:24.968Z"
todos:
  - id: "task-068a83c8-c1"
    content: "Issue import commits its spine changes (tasks.json entries, board rows) to the base branch in a dedicated chore(spine) commit before any task branch is cut, or the task commit stage excludes spine entries not belonging to the current task"
    status: pending
  - id: "task-068a83c8-c2"
    content: "A task branch's committed diff contains no tasks.json/board entries for other tasks imported during the sweep"
    status: pending
  - id: "task-068a83c8-c3"
    content: "Test: fixture runs intake → branch → commit and asserts the task commit touches only the current task's spine entry"
    status: pending
  - id: "task-068a83c8-c4"
    content: "The adversarial reviewer's captured diff excludes spine STATE (tasks.json, chalk.json, updates.jsonl, questions.json, decisions.md, lessons.md, boards/, plans/, handoffs/, analysis/) via git pathspec exclusions, so intake's imported-task and board churn never reaches the reviewer."
    status: pending
  - id: "task-068a83c8-c5"
    content: "Contract artifacts stay visible to the reviewer: the code change and pinned .chalk/tests/ e2e specs (and .chalk/evidence/) are NOT excluded."
    status: pending
  - id: "task-068a83c8-c6"
    content: "The exclusion applies to every captureDiff fallback (git diff HEAD, base...HEAD, origin/base...HEAD, git diff) and to the --stat file list, in both manual and pipeline order."
    status: pending
  - id: "task-068a83c8-c7"
    content: "Locked test proves the reviewer's prompt carries the code + a .chalk/tests/ spec but not tasks.json/board rows/other imported task titles."
    status: pending
---

# fix: issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise

> state: **in-progress** · phase: discovery

## Objective

- Issue import commits its spine changes (tasks.json entries, board rows) to the base branch in a dedicated chore(spine) commit before any task branch is cut, or the task commit stage excludes spine entries not belonging to the current task
- A task branch's committed diff contains no tasks.json/board entries for other tasks imported during the sweep
- Test: fixture runs intake → branch → commit and asserts the task commit touches only the current task's spine entry
- The adversarial reviewer's captured diff excludes spine STATE (tasks.json, chalk.json, updates.jsonl, questions.json, decisions.md, lessons.md, boards/, plans/, handoffs/, analysis/) via git pathspec exclusions, so intake's imported-task and board churn never reaches the reviewer.
- Contract artifacts stay visible to the reviewer: the code change and pinned .chalk/tests/ e2e specs (and .chalk/evidence/) are NOT excluded.
- The exclusion applies to every captureDiff fallback (git diff HEAD, base...HEAD, origin/base...HEAD, git diff) and to the --stat file list, in both manual and pipeline order.
- Locked test proves the reviewer's prompt carries the code + a .chalk/tests/ spec but not tasks.json/board rows/other imported task titles.

## Locked tests (read-only — P6)

- `test/review-diff-scope.test.mjs`
- `test/intake-commit-scope.test.mjs`

## Reviews

- **block** · 2026-07-07T10:24 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
