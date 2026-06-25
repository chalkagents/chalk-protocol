---
generator: chalk-protocol
id: "task-ad36b04c"
name: "fix: guard chalk decisions against a missing decisions.md"
overview: "`chalk decisions` prints a clean message (e.g. 'no decisions recorded yet.') when `.chalk/decisions.md` is missing or empty"
created: "2026-06-25T13:23:12.865Z"
todos:
  - id: "task-ad36b04c-c1"
    content: "`chalk decisions` prints a clean message (e.g. 'no decisions recorded yet.') when `.chalk/decisions.md` is missing or empty"
    status: done
  - id: "task-ad36b04c-c2"
    content: "No unhandled exception/stack trace is shown for the missing-file case"
    status: done
  - id: "task-ad36b04c-c3"
    content: "A test covers the missing/empty decisions-log branch"
    status: done
---

# fix: guard chalk decisions against a missing decisions.md

> state: **done** · phase: discovery

## Objective

- `chalk decisions` prints a clean message (e.g. 'no decisions recorded yet.') when `.chalk/decisions.md` is missing or empty
- No unhandled exception/stack trace is shown for the missing-file case
- A test covers the missing/empty decisions-log branch

## Reviews

- **pass** · 2026-06-25T13:31 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
