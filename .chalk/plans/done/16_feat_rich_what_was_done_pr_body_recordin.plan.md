---
generator: chalk-protocol
id: "task-6f43cfe1"
name: "feat: rich 'what was done' PR body recording"
overview: "lib/prbody.mjs exports buildPrBody(store, task, {changed, narrative}) and hasRecording(task)"
created: "2026-06-28T17:14:58.497Z"
todos:
  - id: "task-6f43cfe1-c1"
    content: "lib/prbody.mjs exports buildPrBody(store, task, {changed, narrative}) and hasRecording(task)"
    status: done
  - id: "task-6f43cfe1-c2"
    content: "buildPrBody renders Summary, 'What was done', Changes (the changed files), Acceptance criteria, and Test plan sections, with a 'Closes #N' footer when the task has an issue"
    status: done
  - id: "task-6f43cfe1-c3"
    content: "when no narrative is supplied buildPrBody falls back to a structured default line (no empty 'What was done'); an optional BYO protocol.prbody.command authors the narrative, like handoff/e2e"
    status: done
  - id: "task-6f43cfe1-c4"
    content: "chalk pr builds the body via buildPrBody from the branch's committed changes (diff against base) and sets task.pr.recorded=true when the change set is non-empty"
    status: done
  - id: "task-6f43cfe1-c5"
    content: "hasRecording(task) returns task.pr?.recorded === true — the hook the later merge gate uses"
    status: done
  - id: "task-6f43cfe1-c6"
    content: "protocol.prbody default is { command: '' } in store.mjs init defaults"
    status: done
---

# feat: rich 'what was done' PR body recording

> state: **done** · phase: discovery

## Objective

- lib/prbody.mjs exports buildPrBody(store, task, {changed, narrative}) and hasRecording(task)
- buildPrBody renders Summary, 'What was done', Changes (the changed files), Acceptance criteria, and Test plan sections, with a 'Closes #N' footer when the task has an issue
- when no narrative is supplied buildPrBody falls back to a structured default line (no empty 'What was done'); an optional BYO protocol.prbody.command authors the narrative, like handoff/e2e
- chalk pr builds the body via buildPrBody from the branch's committed changes (diff against base) and sets task.pr.recorded=true when the change set is non-empty
- hasRecording(task) returns task.pr?.recorded === true — the hook the later merge gate uses
- protocol.prbody default is { command: '' } in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/prbody.test.mjs`

## Reviews

- **pass** · 2026-06-28T17:22 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
