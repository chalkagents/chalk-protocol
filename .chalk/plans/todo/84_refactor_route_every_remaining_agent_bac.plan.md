---
generator: chalk-protocol
id: "task-d8fd5057"
name: "refactor: route every remaining agent-backed stage through Agent Runner"
overview: "Reviewer, discovery, feedback, retro, handoff, PR narrative, and regression authoring all call the Agent Runner."
created: "2026-08-03T07:13:11.291Z"
todos:
  - id: "task-d8fd5057-c1"
    content: "Reviewer, discovery, feedback, retro, handoff, PR narrative, and regression authoring all call the Agent Runner."
    status: pending
  - id: "task-d8fd5057-c2"
    content: "Existing role-specific parsers receive normalized runner output and preserve their current success/error behavior."
    status: pending
  - id: "task-d8fd5057-c3"
    content: "Non-zero commands that still return a valid reviewer verdict remain parseable."
    status: pending
  - id: "task-d8fd5057-c4"
    content: "Best-effort narrative roles retain their fallback behavior and useful diagnostics."
    status: pending
  - id: "task-d8fd5057-c5"
    content: "Usage and wall-clock logging follow one runner-owned policy across every role."
    status: pending
  - id: "task-d8fd5057-c6"
    content: "Duplicate provider-aware execution and envelope-unwrapping code is removed."
    status: pending
  - id: "task-d8fd5057-c7"
    content: "Tests exercise each migrated role through the same fake-adapter seam."
    status: pending
  - id: "task-d8fd5057-c8"
    content: "The deletion test holds: removing Agent Runner would force execution complexity back into every caller."
    status: pending
---

# refactor: route every remaining agent-backed stage through Agent Runner

> state: **specd** · phase: discovery

## Objective

- Reviewer, discovery, feedback, retro, handoff, PR narrative, and regression authoring all call the Agent Runner.
- Existing role-specific parsers receive normalized runner output and preserve their current success/error behavior.
- Non-zero commands that still return a valid reviewer verdict remain parseable.
- Best-effort narrative roles retain their fallback behavior and useful diagnostics.
- Usage and wall-clock logging follow one runner-owned policy across every role.
- Duplicate provider-aware execution and envelope-unwrapping code is removed.
- Tests exercise each migrated role through the same fake-adapter seam.
- The deletion test holds: removing Agent Runner would force execution complexity back into every caller.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
