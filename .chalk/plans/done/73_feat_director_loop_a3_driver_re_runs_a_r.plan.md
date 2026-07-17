---
generator: chalk-protocol
id: "task-86fadfe0"
name: "feat(director-loop): A3 · driver re-runs a redirected task and resolves the directive"
overview: "runnableTasks treats a re-opened task (in-progress + unresolved directive) as runnable so chalk run/work re-execute it; a plain in-progress task (no pending directive) is NOT re-picked"
created: "2026-07-17T09:32:56.696Z"
todos:
  - id: "task-86fadfe0-c1"
    content: "runnableTasks treats a re-opened task (in-progress + unresolved directive) as runnable so chalk run/work re-execute it; a plain in-progress task (no pending directive) is NOT re-picked"
    status: done
  - id: "task-86fadfe0-c2"
    content: "chalk done (and the pipeline merge) resolves the task's pending director corrections (resolved:true, resolvedAt) and reports it — the rework landed, so the loop closes"
    status: done
  - id: "task-86fadfe0-c3"
    content: "chalk next surfaces a re-opened task ('re-opened for rework') and its pending corrections with the rebuild instruction, so it is not silently stranded as plain in-progress"
    status: done
---

# feat(director-loop): A3 · driver re-runs a redirected task and resolves the directive

> state: **done** · phase: discovery

## Objective

- runnableTasks treats a re-opened task (in-progress + unresolved directive) as runnable so chalk run/work re-execute it; a plain in-progress task (no pending directive) is NOT re-picked
- chalk done (and the pipeline merge) resolves the task's pending director corrections (resolved:true, resolvedAt) and reports it — the rework landed, so the loop closes
- chalk next surfaces a re-opened task ('re-opened for rework') and its pending corrections with the rebuild instruction, so it is not silently stranded as plain in-progress

## Locked tests (read-only — P6)

- `test/director-rework-loop.test.mjs`

## Reviews

- **block** · 2026-07-17T10:17 · adversary
- **pass** · 2026-07-17T10:24 · adversary
- **stale** · 2026-07-17T10:27 · amend-spec
- **pass** · 2026-07-17T10:29 · adversary
- **pass** · 2026-07-17T10:33 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
