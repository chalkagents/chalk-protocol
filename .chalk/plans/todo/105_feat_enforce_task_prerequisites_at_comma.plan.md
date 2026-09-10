---
generator: chalk-protocol
id: "task-e3b7ad34"
name: "feat: enforce task prerequisites at command boundaries"
overview: "Direct start/work and automated execution refuse incomplete, missing or cyclic dependencies before any work or state mutation; next and execution share dependency evaluation."
created: "2026-09-08T07:55:41.629Z"
todos:
  - id: "task-e3b7ad34-c1"
    content: "Direct start/work and automated execution refuse incomplete, missing or cyclic dependencies before any work or state mutation; next and execution share dependency evaluation."
    status: pending
  - id: "task-e3b7ad34-c2"
    content: "A reopened or blocked predecessor cannot leave a dependent task silently authorized; single-task and worktree behavior remain covered."
    status: pending
---

# feat: enforce task prerequisites at command boundaries

> state: **specd** · phase: discovery

## Objective

- Direct start/work and automated execution refuse incomplete, missing or cyclic dependencies before any work or state mutation; next and execution share dependency evaluation.
- A reopened or blocked predecessor cannot leave a dependent task silently authorized; single-task and worktree behavior remain covered.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
