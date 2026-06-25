---
generator: chalk-protocol
id: "task-7edc0360"
name: "fix: chalk lesson list cap diverges from the memory injected into agents"
overview: "`chalk lesson list` and `buildContext` use the same cap so the listed lessons match what is injected"
created: "2026-06-25T13:23:12.863Z"
todos:
  - id: "task-7edc0360-c1"
    content: "`chalk lesson list` and `buildContext` use the same cap so the listed lessons match what is injected"
    status: done
  - id: "task-7edc0360-c2"
    content: "If a fuller view is intentional, document the distinction and/or gate it behind an explicit flag (e.g. `--all`)"
    status: done
  - id: "task-7edc0360-c3"
    content: "A test asserts the listed lessons correspond to the injected set"
    status: done
---

# fix: chalk lesson list cap diverges from the memory injected into agents

> state: **done** · phase: discovery

## Objective

- `chalk lesson list` and `buildContext` use the same cap so the listed lessons match what is injected
- If a fuller view is intentional, document the distinction and/or gate it behind an explicit flag (e.g. `--all`)
- A test asserts the listed lessons correspond to the injected set

## Reviews

- **pass** · 2026-06-25T13:29 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
