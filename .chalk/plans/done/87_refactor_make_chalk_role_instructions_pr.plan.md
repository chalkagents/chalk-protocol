---
generator: chalk-protocol
id: "task-5c353a1f"
name: "refactor: make Chalk role instructions provider-neutral"
overview: "Canonical instructions exist for every agent-backed role named by Agent Adapter Protocol v1."
created: "2026-08-03T07:55:27.488Z"
todos:
  - id: "task-5c353a1f-c1"
    content: "Canonical instructions exist for every agent-backed role named by Agent Adapter Protocol v1."
    status: done
  - id: "task-5c353a1f-c2"
    content: "Canonical content contains no provider command, model name, native tool list, or provider frontmatter."
    status: done
  - id: "task-5c353a1f-c3"
    content: "Agent Runner supplies canonical instructions separately from task/run context."
    status: done
  - id: "task-5c353a1f-c4"
    content: "Adapters can combine the fields when their CLI has no system-prompt concept."
    status: done
  - id: "task-5c353a1f-c5"
    content: "Existing Claude agent files, if retained, are generated or checked from the canonical source instead of serving as the source of truth."
    status: done
  - id: "task-5c353a1f-c6"
    content: "Provider-native generated assets are optional conveniences, not runtime requirements."
    status: done
  - id: "task-5c353a1f-c7"
    content: "Drift tests prove generated/native assets cannot silently diverge from canonical instructions."
    status: done
  - id: "task-5c353a1f-c8"
    content: "Executor raise behavior and reviewer decision-digest behavior remain present."
    status: done
---

# refactor: make Chalk role instructions provider-neutral

> state: **done** · phase: discovery

## Objective

- Canonical instructions exist for every agent-backed role named by Agent Adapter Protocol v1.
- Canonical content contains no provider command, model name, native tool list, or provider frontmatter.
- Agent Runner supplies canonical instructions separately from task/run context.
- Adapters can combine the fields when their CLI has no system-prompt concept.
- Existing Claude agent files, if retained, are generated or checked from the canonical source instead of serving as the source of truth.
- Provider-native generated assets are optional conveniences, not runtime requirements.
- Drift tests prove generated/native assets cannot silently diverge from canonical instructions.
- Executor raise behavior and reviewer decision-digest behavior remain present.

## Locked tests (read-only — P6)

- `test/role-instructions.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
