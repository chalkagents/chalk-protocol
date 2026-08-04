---
generator: chalk-protocol
id: "task-2dfad5a4"
name: "fix(agent-runner): preserve exact raw-command stage prompts"
overview: "Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner."
created: "2026-08-04T11:41:45.612Z"
todos:
  - id: "task-2dfad5a4-c1"
    content: "Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner."
    status: done
  - id: "task-2dfad5a4-c2"
    content: "Protocol v1 profiles still receive separate canonical `instructions` and task `context` fields."
    status: done
  - id: "task-2dfad5a4-c3"
    content: "Executor streaming, structured-role decoding, timeouts, and cost capture remain compatible."
    status: done
  - id: "task-2dfad5a4-c4"
    content: "Tests call the same production `context` path used by executor, planner, reviewer, and analysis roles rather than bypassing it with test-only `input` calls."
    status: done
  - id: "task-2dfad5a4-c5"
    content: "No workflow module branches on provider or adapter names."
    status: done
---

# fix(agent-runner): preserve exact raw-command stage prompts

> state: **done** · phase: discovery

## Objective

- Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner.
- Protocol v1 profiles still receive separate canonical `instructions` and task `context` fields.
- Executor streaming, structured-role decoding, timeouts, and cost capture remain compatible.
- Tests call the same production `context` path used by executor, planner, reviewer, and analysis roles rather than bypassing it with test-only `input` calls.
- No workflow module branches on provider or adapter names.

## Locked tests (read-only — P6)

- `test/raw-command-prompt-compat.test.mjs`

## Reviews

- **pass** · 2026-08-04T12:06 · codex

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
