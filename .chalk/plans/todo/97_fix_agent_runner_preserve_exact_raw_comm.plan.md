---
generator: chalk-protocol
id: "task-2dfad5a4"
name: "fix(agent-runner): preserve exact raw-command stage prompts"
overview: "Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner."
created: "2026-08-04T11:41:45.612Z"
todos:
  - id: "task-2dfad5a4-c1"
    content: "Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner."
    status: pending
  - id: "task-2dfad5a4-c2"
    content: "Protocol v1 profiles still receive separate canonical `instructions` and task `context` fields."
    status: pending
  - id: "task-2dfad5a4-c3"
    content: "Executor streaming, structured-role decoding, timeouts, and cost capture remain compatible."
    status: pending
  - id: "task-2dfad5a4-c4"
    content: "Tests call the same production `context` path used by executor, planner, reviewer, and analysis roles rather than bypassing it with test-only `input` calls."
    status: pending
  - id: "task-2dfad5a4-c5"
    content: "No workflow module branches on provider or adapter names."
    status: pending
---

# fix(agent-runner): preserve exact raw-command stage prompts

> state: **specd** · phase: discovery

## Objective

- Every legacy `protocol.*.command` role receives byte-for-byte the same stdin it received before Agent Runner.
- Protocol v1 profiles still receive separate canonical `instructions` and task `context` fields.
- Executor streaming, structured-role decoding, timeouts, and cost capture remain compatible.
- Tests call the same production `context` path used by executor, planner, reviewer, and analysis roles rather than bypassing it with test-only `input` calls.
- No workflow module branches on provider or adapter names.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
