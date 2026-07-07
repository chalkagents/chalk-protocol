---
generator: chalk-protocol
id: "task-86b9cfe4"
name: "feat: opt-in all-locks integrity — done tasks' locked tests stay protected"
overview: "protocol.integrity accepts 'in-progress' (default when unset — today's behavior) or 'all-locks'. Under 'all-locks', chalk verify checks locked-test hash integrity for DONE tasks in addition to in-progress ones; unset/'in-progress' leaves done tasks' locks unchecked exactly as before."
created: "2026-07-06T10:05:49.986Z"
todos:
  - id: "task-86b9cfe4-c1"
    content: "protocol.integrity accepts 'in-progress' (default when unset — today's behavior) or 'all-locks'. Under 'all-locks', chalk verify checks locked-test hash integrity for DONE tasks in addition to in-progress ones; unset/'in-progress' leaves done tasks' locks unchecked exactly as before."
    status: done
  - id: "task-86b9cfe4-c2"
    content: "Under 'all-locks', tampering (or deleting) a locked test owned by a DONE task makes verify RED and the report names the owning task and the offending path and points to chalk amend-spec; a matching hash stays green."
    status: done
  - id: "task-86b9cfe4-c3"
    content: "chalk amend-spec remains the only sanctioned change path: re-locking a done task's test updates its pin so verify returns GREEN again — no direct tasks.json editing."
    status: done
  - id: "task-86b9cfe4-c4"
    content: "Locked test proves all four states: all-locks catches a tampered done-task lock (RED), default mode ignores the same tamper (GREEN), a clean all-locks tree is GREEN, and amend-spec restores GREEN after a legitimate change."
    status: done
---

# feat: opt-in all-locks integrity — done tasks' locked tests stay protected

> state: **done** · phase: discovery

## Objective

- protocol.integrity accepts 'in-progress' (default when unset — today's behavior) or 'all-locks'. Under 'all-locks', chalk verify checks locked-test hash integrity for DONE tasks in addition to in-progress ones; unset/'in-progress' leaves done tasks' locks unchecked exactly as before.
- Under 'all-locks', tampering (or deleting) a locked test owned by a DONE task makes verify RED and the report names the owning task and the offending path and points to chalk amend-spec; a matching hash stays green.
- chalk amend-spec remains the only sanctioned change path: re-locking a done task's test updates its pin so verify returns GREEN again — no direct tasks.json editing.
- Locked test proves all four states: all-locks catches a tampered done-task lock (RED), default mode ignores the same tamper (GREEN), a clean all-locks tree is GREEN, and amend-spec restores GREEN after a legitimate change.

## Locked tests (read-only — P6)

- `test/all-locks-integrity.test.mjs`

## Reviews

- **pass** · 2026-07-07T08:34 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
