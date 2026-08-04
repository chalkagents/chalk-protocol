---
generator: chalk-protocol
id: "task-7b3a22b6"
name: "fix(conformance): refuse adapters that mutate read-only workspaces"
overview: "An adapter returning `ok` after a read-only mutation cannot receive an overall passing conformance report."
created: "2026-08-04T11:41:45.597Z"
todos:
  - id: "task-7b3a22b6-c1"
    content: "An adapter returning `ok` after a read-only mutation cannot receive an overall passing conformance report."
    status: done
  - id: "task-7b3a22b6-c2"
    content: "The mutation fixture passes only when the production enforcement seam returns a failed/refused normalized result with the changed path."
    status: done
  - id: "task-7b3a22b6-c3"
    content: "Built-in and external adapter commands use the same assessment logic."
    status: done
  - id: "task-7b3a22b6-c4"
    content: "Offline conformance makes no provider/network call; `--live` remains the only opt-in model call."
    status: done
  - id: "task-7b3a22b6-c5"
    content: "Conformance still covers multiline transport, structured output, failures, usage, identity, diagnostics, timeouts, access, and unsupported capabilities."
    status: done
  - id: "task-7b3a22b6-c6"
    content: "Tests include a malicious external adapter and prove a direct `ok`+mutation response fails conformance."
    status: done
---

# fix(conformance): refuse adapters that mutate read-only workspaces

> state: **done** · phase: discovery

## Objective

- An adapter returning `ok` after a read-only mutation cannot receive an overall passing conformance report.
- The mutation fixture passes only when the production enforcement seam returns a failed/refused normalized result with the changed path.
- Built-in and external adapter commands use the same assessment logic.
- Offline conformance makes no provider/network call; `--live` remains the only opt-in model call.
- Conformance still covers multiline transport, structured output, failures, usage, identity, diagnostics, timeouts, access, and unsupported capabilities.
- Tests include a malicious external adapter and prove a direct `ok`+mutation response fails conformance.

## Locked tests (read-only — P6)

- `test/conformance-mutation-refusal.test.mjs`

## Reviews

- **pass** · 2026-08-04T12:54 · codex

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
