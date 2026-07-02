---
generator: chalk-protocol
id: "task-9f55f886"
name: "feat: chalk discover — turn a brief into scoped, criteria-bearing tasks"
overview: "chalk discover (brief from positional args, --input, or --file) runs the agent and creates each proposed task as a specd chalk task with its acceptance criteria and milestone"
created: "2026-06-28T22:04:35.188Z"
todos:
  - id: "task-9f55f886-c1"
    content: "chalk discover (brief from positional args, --input, or --file) runs the agent and creates each proposed task as a specd chalk task with its acceptance criteria and milestone"
    status: done
  - id: "task-9f55f886-c2"
    content: "it dedupes proposed tasks against existing task titles (titlesSimilar) and skips duplicates"
    status: done
  - id: "task-9f55f886-c3"
    content: "a proposed task's after-titles are resolved to dependency ids when they match a created or existing task (best-effort); --dry-run previews without creating"
    status: done
  - id: "task-9f55f886-c4"
    content: "with no brief it errors with usage; protocol.discovery default is { command: '' } in store.mjs init defaults"
    status: done
---

# feat: chalk discover — turn a brief into scoped, criteria-bearing tasks

> state: **done** · phase: discovery

## Objective

- chalk discover (brief from positional args, --input, or --file) runs the agent and creates each proposed task as a specd chalk task with its acceptance criteria and milestone
- it dedupes proposed tasks against existing task titles (titlesSimilar) and skips duplicates
- a proposed task's after-titles are resolved to dependency ids when they match a created or existing task (best-effort); --dry-run previews without creating
- with no brief it errors with usage; protocol.discovery default is { command: '' } in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/discover-cli.test.mjs`

## Reviews

- **pass** · 2026-06-28T22:14 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
