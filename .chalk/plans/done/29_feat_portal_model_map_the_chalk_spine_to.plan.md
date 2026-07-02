---
generator: chalk-protocol
id: "task-fb4eadec"
name: "feat: portal model — map the chalk spine to the portal schema"
overview: "lib/portal.mjs exports portalModel(store, opts) returning { slug, meta, scope, milestones, updates } derived from the spine, and scopeState(taskState)"
created: "2026-06-28T22:26:35.969Z"
todos:
  - id: "task-fb4eadec-c1"
    content: "lib/portal.mjs exports portalModel(store, opts) returning { slug, meta, scope, milestones, updates } derived from the spine, and scopeState(taskState)"
    status: done
  - id: "task-fb4eadec-c2"
    content: "scope maps each task to a scope item: state done->delivered, in-progress->approved, else->defined; title stripped of any conventional prefix; acceptanceCriteria carried as {text}; a verify note when the task is released"
    status: done
  - id: "task-fb4eadec-c3"
    content: "milestones are derived from the distinct task.milestone values with status completed/in-progress/pending from their done ratio, a project slug, and a best-effort dueDate"
    status: done
  - id: "task-fb4eadec-c4"
    content: "updates are filtered to the client-safe type allow-list — non-client-safe events (e.g. lesson-learned, planning-generated) are DROPPED, not surfaced — each carrying id/project/type/title/at/actorRole"
    status: done
---

# feat: portal model — map the chalk spine to the portal schema

> state: **done** · phase: discovery

## Objective

- lib/portal.mjs exports portalModel(store, opts) returning { slug, meta, scope, milestones, updates } derived from the spine, and scopeState(taskState)
- scope maps each task to a scope item: state done->delivered, in-progress->approved, else->defined; title stripped of any conventional prefix; acceptanceCriteria carried as {text}; a verify note when the task is released
- milestones are derived from the distinct task.milestone values with status completed/in-progress/pending from their done ratio, a project slug, and a best-effort dueDate
- updates are filtered to the client-safe type allow-list — non-client-safe events (e.g. lesson-learned, planning-generated) are DROPPED, not surfaced — each carrying id/project/type/title/at/actorRole

## Locked tests (read-only — P6)

- `test/portal.test.mjs`

## Reviews

- **pass** · 2026-06-28T22:29 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
