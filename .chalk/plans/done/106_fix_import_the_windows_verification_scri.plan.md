---
generator: chalk-protocol
id: "task-155a35cf"
name: "fix: import the Windows verification script writer"
overview: "The Windows verification supervisor can create its command wrapper without an undefined filesystem binding."
created: "2026-09-15T14:35:30.293Z"
todos:
  - id: "task-155a35cf-c1"
    content: "The Windows verification supervisor can create its command wrapper without an undefined filesystem binding."
    status: done
  - id: "task-155a35cf-c2"
    content: "Existing Windows verification tests reach their intended filesystem and process-tree assertions instead of failing during supervisor startup."
    status: done
  - id: "task-155a35cf-c3"
    content: "The full Ubuntu, minimum-Node, and Windows CI matrix is green."
    status: done
---

# fix: import the Windows verification script writer

> state: **done** · phase: discovery

## Objective

- The Windows verification supervisor can create its command wrapper without an undefined filesystem binding.
- Existing Windows verification tests reach their intended filesystem and process-tree assertions instead of failing during supervisor startup.
- The full Ubuntu, minimum-Node, and Windows CI matrix is green.

## Locked tests (read-only — P6)

- `test/verification-absent-authorities.test.mjs`
- `test/verification-supervision.test.mjs`
- `test/verification-lifecycle-continuity.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
