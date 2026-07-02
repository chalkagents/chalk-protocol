---
generator: chalk-protocol
id: "task-a16e36ea"
name: "feat: chalk archive — compact released tasks + old events into .chalk/archive"
overview: "chalk archive moves done+released tasks (stamped archivedAt) to .chalk/archive/tasks-<year>.json and only their event lines to updates-<year>.jsonl; global events and other tasks' events stay live"
created: "2026-07-02T05:01:01.565Z"
todos:
  - id: "task-a16e36ea-c1"
    content: "chalk archive moves done+released tasks (stamped archivedAt) to .chalk/archive/tasks-<year>.json and only their event lines to updates-<year>.jsonl; global events and other tasks' events stay live"
    status: done
  - id: "task-a16e36ea-c2"
    content: "a candidate referenced by a remaining task's after is KEPT with a printed reason; done-unreleased tasks stay (release idempotency); archived tasks are never re-released"
    status: done
  - id: "task-a16e36ea-c3"
    content: "true"
    status: done
  - id: "task-a16e36ea-c4"
    content: "the portal still shows archived delivered scope (portalModel reads the archive); backlog stays coherent after compaction"
    status: done
---

# feat: chalk archive — compact released tasks + old events into .chalk/archive

> state: **done** · phase: discovery

## Objective

- chalk archive moves done+released tasks (stamped archivedAt) to .chalk/archive/tasks-<year>.json and only their event lines to updates-<year>.jsonl; global events and other tasks' events stay live
- a candidate referenced by a remaining task's after is KEPT with a printed reason; done-unreleased tasks stay (release idempotency); archived tasks are never re-released
- true
- the portal still shows archived delivered scope (portalModel reads the archive); backlog stays coherent after compaction

## Locked tests (read-only — P6)

- `test/archive.test.mjs`

## Reviews

- **pass** · 2026-07-02T06:21 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
