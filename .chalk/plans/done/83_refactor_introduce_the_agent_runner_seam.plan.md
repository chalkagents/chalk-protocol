---
generator: chalk-protocol
id: "task-16b28180"
name: "refactor: introduce the Agent Runner seam and migrate executor + planner"
overview: "Executor and planner invoke one `runAgent(role, request)` interface instead of calling child-process helpers directly."
created: "2026-08-03T06:56:02.537Z"
todos:
  - id: "task-16b28180-c1"
    content: "Executor and planner invoke one `runAgent(role, request)` interface instead of calling child-process helpers directly."
    status: done
  - id: "task-16b28180-c2"
    content: "The runner returns normalized status, text, structured output, usage, identity, and diagnostics as applicable."
    status: done
  - id: "task-16b28180-c3"
    content: "Existing command-string configuration produces the same observable executor and planner behavior."
    status: done
  - id: "task-16b28180-c4"
    content: "Executor terminal output remains visible and planner output remains storable as plain text."
    status: done
  - id: "task-16b28180-c5"
    content: "Timeouts, non-zero exits, missing binaries, malformed envelopes, and usage capture are covered by fake-adapter tests."
    status: done
  - id: "task-16b28180-c6"
    content: "Project `protocol.runner` is no longer prepended to agent commands; it remains scoped to project toolchain commands."
    status: done
  - id: "task-16b28180-c7"
    content: "No Chalk workflow module branches on a provider name."
    status: done
  - id: "task-16b28180-c8"
    content: "Cost-ledger behavior from #99 remains compatible."
    status: done
---

# refactor: introduce the Agent Runner seam and migrate executor + planner

> state: **done** · phase: discovery

## Objective

- Executor and planner invoke one `runAgent(role, request)` interface instead of calling child-process helpers directly.
- The runner returns normalized status, text, structured output, usage, identity, and diagnostics as applicable.
- Existing command-string configuration produces the same observable executor and planner behavior.
- Executor terminal output remains visible and planner output remains storable as plain text.
- Timeouts, non-zero exits, missing binaries, malformed envelopes, and usage capture are covered by fake-adapter tests.
- Project `protocol.runner` is no longer prepended to agent commands; it remains scoped to project toolchain commands.
- No Chalk workflow module branches on a provider name.
- Cost-ledger behavior from #99 remains compatible.

## Locked tests (read-only — P6)

- `test/agent-runner.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
