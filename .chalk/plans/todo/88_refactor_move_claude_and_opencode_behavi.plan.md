---
generator: chalk-protocol
id: "task-42ddf49a"
name: "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"
overview: "Claude adapter owns CLI flags, canonical prompt mapping, output-envelope decoding, usage normalization, and permission mapping."
created: "2026-08-03T08:10:52.717Z"
todos:
  - id: "task-42ddf49a-c1"
    content: "Claude adapter owns CLI flags, canonical prompt mapping, output-envelope decoding, usage normalization, and permission mapping."
    status: pending
  - id: "task-42ddf49a-c2"
    content: "OpenCode adapter owns stdin-to-argument transport, JSON cleanup, usage/identity normalization where available, and permission mapping."
    status: pending
  - id: "task-42ddf49a-c3"
    content: "Both adapters support every role their current integration supports."
    status: pending
  - id: "task-42ddf49a-c4"
    content: "Existing `--executor claude` and `--executor opencode` behavior migrates compatibly or emits an exact migration command."
    status: pending
  - id: "task-42ddf49a-c5"
    content: "Core modules do not inspect Claude/OpenCode binary names, flags, script paths, or environment variables."
    status: pending
  - id: "task-42ddf49a-c6"
    content: "Existing cost ledger records remain readable and new adapter usage records use the normalized shape."
    status: pending
  - id: "task-42ddf49a-c7"
    content: "Same-reviewer warnings use adapter identity rather than command parsing."
    status: pending
  - id: "task-42ddf49a-c8"
    content: "Provider adapter failures retain raw diagnostics without leaking credentials."
    status: pending
  - id: "task-42ddf49a-c9"
    content: "Package tests prove all runtime adapter assets ship."
    status: pending
---

# refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1

> state: **specd** · phase: discovery

## Objective

- Claude adapter owns CLI flags, canonical prompt mapping, output-envelope decoding, usage normalization, and permission mapping.
- OpenCode adapter owns stdin-to-argument transport, JSON cleanup, usage/identity normalization where available, and permission mapping.
- Both adapters support every role their current integration supports.
- Existing `--executor claude` and `--executor opencode` behavior migrates compatibly or emits an exact migration command.
- Core modules do not inspect Claude/OpenCode binary names, flags, script paths, or environment variables.
- Existing cost ledger records remain readable and new adapter usage records use the normalized shape.
- Same-reviewer warnings use adapter identity rather than command parsing.
- Provider adapter failures retain raw diagnostics without leaking credentials.
- Package tests prove all runtime adapter assets ship.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
