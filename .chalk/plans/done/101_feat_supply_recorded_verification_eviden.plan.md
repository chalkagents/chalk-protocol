---
generator: chalk-protocol
id: "task-aeb59c37"
name: "feat: supply recorded verification evidence to reviewers"
overview: "Review receives the latest verification evidence for its worktree and matching task, with status, source/spec/config freshness, command outcomes and local log references; missing, malformed or stale evidence is explicitly labeled."
created: "2026-09-08T07:55:40.689Z"
todos:
  - id: "task-aeb59c37-c1"
    content: "Review receives the latest verification evidence for its worktree and matching task, with status, source/spec/config freshness, command outcomes and local log references; missing, malformed or stale evidence is explicitly labeled."
    status: done
  - id: "task-aeb59c37-c2"
    content: "Unrelated worktree/task evidence is never presented as current; summaries are bounded and raw logs are never injected as instructions; no held-out assertion output is exposed."
    status: done
---

# feat: supply recorded verification evidence to reviewers

> state: **done** · phase: discovery

## Objective

- Review receives the latest verification evidence for its worktree and matching task, with status, source/spec/config freshness, command outcomes and local log references; missing, malformed or stale evidence is explicitly labeled.
- Unrelated worktree/task evidence is never presented as current; summaries are bounded and raw logs are never injected as instructions; no held-out assertion output is exposed.

## Locked tests (read-only — P6)

- `test/review-evidence.test.mjs`
- `test/review-evidence-integration.test.mjs`

## Reviews

- **block** · 2026-09-08T22:08 · adversary
- **block** · 2026-09-08T22:22 · adversary
- **block** · 2026-09-08T22:34 · adversary
- **pass** · 2026-09-08T22:44 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
