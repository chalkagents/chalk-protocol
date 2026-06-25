---
generator: chalk-protocol
id: "task-cf3334c7"
name: "feat: add explicit `chalk lesson add` subcommand to disambiguate from `list`"
overview: "`chalk lesson add \"<text>\"` records the given text as a lesson, including single-word texts like `list`"
created: "2026-06-25T13:39:43.988Z"
todos:
  - id: "task-cf3334c7-c1"
    content: "`chalk lesson add \"<text>\"` records the given text as a lesson, including single-word texts like `list`"
    status: done
  - id: "task-cf3334c7-c2"
    content: "Bare `chalk lesson list` continues to print the injected lessons (with `--all` for full history)"
    status: done
  - id: "task-cf3334c7-c3"
    content: "`chalk lesson \"<text>\"` (no subcommand) still records as before for back-compat"
    status: done
  - id: "task-cf3334c7-c4"
    content: "Help text in bin/chalk.mjs documents the `add` form"
    status: done
  - id: "task-cf3334c7-c5"
    content: "A test asserts that a lesson with the exact text `list` is recorded and does not trigger the list subcommand"
    status: done
---

# feat: add explicit `chalk lesson add` subcommand to disambiguate from `list`

> state: **done** · phase: discovery

## Objective

- `chalk lesson add "<text>"` records the given text as a lesson, including single-word texts like `list`
- Bare `chalk lesson list` continues to print the injected lessons (with `--all` for full history)
- `chalk lesson "<text>"` (no subcommand) still records as before for back-compat
- Help text in bin/chalk.mjs documents the `add` form
- A test asserts that a lesson with the exact text `list` is recorded and does not trigger the list subcommand

## Reviews

- **pass** · 2026-06-25T13:44 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
