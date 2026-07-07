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
---

# fix: issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise

> state: **specd** · phase: discovery

## Objective

- Issue import commits its spine changes (tasks.json entries, board rows) to the base branch in a dedicated chore(spine) commit before any task branch is cut, or the task commit stage excludes spine entries not belonging to the current task
- A task branch's committed diff contains no tasks.json/board entries for other tasks imported during the sweep
- Test: fixture runs intake → branch → commit and asserts the task commit touches only the current task's spine entry

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
