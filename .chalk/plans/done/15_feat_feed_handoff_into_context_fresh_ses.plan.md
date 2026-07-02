---
generator: chalk-protocol
id: "task-1ce3dd65"
name: "feat: feed handoff into context + fresh-session signal (chalk next --json)"
overview: "buildContext appends a 'Handoff from the prior session' section containing the latest handoff doc when task.handoff is present, so a fresh session resumes from it"
created: "2026-06-28T16:41:18.335Z"
todos:
  - id: "task-1ce3dd65-c1"
    content: "buildContext appends a 'Handoff from the prior session' section containing the latest handoff doc when task.handoff is present, so a fresh session resumes from it"
    status: done
  - id: "task-1ce3dd65-c2"
    content: "a missing/unreadable handoff file is tolerated — buildContext still renders the rest of the context (no crash)"
    status: done
  - id: "task-1ce3dd65-c3"
    content: "chalk next --json emits machine-readable JSON: { task: {id,title,state}|null, freshSession: true, handoff: <path|null>, action: 'work'|'start' }"
    status: done
  - id: "task-1ce3dd65-c4"
    content: "the JSON selects the in-progress task first, else the next runnable task; freshSession is always true (one-session-per-task signal) and handoff is the task's latest handoff path or null"
    status: done
  - id: "task-1ce3dd65-c5"
    content: "plain chalk next (no --json) output is unchanged"
    status: done
---

# feat: feed handoff into context + fresh-session signal (chalk next --json)

> state: **done** · phase: discovery

## Objective

- buildContext appends a 'Handoff from the prior session' section containing the latest handoff doc when task.handoff is present, so a fresh session resumes from it
- a missing/unreadable handoff file is tolerated — buildContext still renders the rest of the context (no crash)
- chalk next --json emits machine-readable JSON: { task: {id,title,state}|null, freshSession: true, handoff: <path|null>, action: 'work'|'start' }
- the JSON selects the in-progress task first, else the next runnable task; freshSession is always true (one-session-per-task signal) and handoff is the task's latest handoff path or null
- plain chalk next (no --json) output is unchanged

## Locked tests (read-only — P6)

- `test/handoff-context.test.mjs`

## Reviews

- **pass** · 2026-06-28T16:58 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
