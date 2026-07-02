---
generator: chalk-protocol
id: "task-3175f8f5"
name: "feat: chalk handoff — structured handoff doc (template + optional agent)"
overview: "lib/handoff.mjs exports writeHandoff(store, task, {reason, note, by}) and latestHandoff(store, task)"
created: "2026-06-28T16:41:18.174Z"
todos:
  - id: "task-3175f8f5-c1"
    content: "lib/handoff.mjs exports writeHandoff(store, task, {reason, note, by}) and latestHandoff(store, task)"
    status: done
  - id: "task-3175f8f5-c2"
    content: "writeHandoff renders a structured doc: title, task id, state, reason, acceptance criteria, changed files (from the workdir git status), locked tests, and a 'pickup in a fresh session' instruction"
    status: done
  - id: "task-3175f8f5-c3"
    content: "the doc is written under .chalk/handoffs/<shortId>-<seq>.md (seq increments) and a pointer {path, at, reason} is recorded on task.handoff"
    status: done
  - id: "task-3175f8f5-c4"
    content: "latestHandoff returns the most recent handoff record for a task (or null), and the file path it points to exists"
    status: done
  - id: "task-3175f8f5-c5"
    content: "an optional BYO protocol.handoff.command enriches the narrative; when unset the template alone is produced (no model call), like e2e/regression"
    status: done
  - id: "task-3175f8f5-c6"
    content: "chalk handoff <id> [--note] writes a handoff and prints its path; .chalk/handoffs/ is gitignored (single-canonical via store.root)"
    status: done
  - id: "task-3175f8f5-c7"
    content: "protocol.handoff default is { command: '', maxAttempts: 3 } in store.mjs init defaults"
    status: done
---

# feat: chalk handoff — structured handoff doc (template + optional agent)

> state: **done** · phase: discovery

## Objective

- lib/handoff.mjs exports writeHandoff(store, task, {reason, note, by}) and latestHandoff(store, task)
- writeHandoff renders a structured doc: title, task id, state, reason, acceptance criteria, changed files (from the workdir git status), locked tests, and a 'pickup in a fresh session' instruction
- the doc is written under .chalk/handoffs/<shortId>-<seq>.md (seq increments) and a pointer {path, at, reason} is recorded on task.handoff
- latestHandoff returns the most recent handoff record for a task (or null), and the file path it points to exists
- an optional BYO protocol.handoff.command enriches the narrative; when unset the template alone is produced (no model call), like e2e/regression
- chalk handoff <id> [--note] writes a handoff and prints its path; .chalk/handoffs/ is gitignored (single-canonical via store.root)
- protocol.handoff default is { command: '', maxAttempts: 3 } in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/handoff.test.mjs`

## Reviews

- **pass** · 2026-06-28T16:47 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
