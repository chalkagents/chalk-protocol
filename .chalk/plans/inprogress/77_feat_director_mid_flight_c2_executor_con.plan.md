---
generator: chalk-protocol
id: "task-622ec407"
name: "feat(director-mid-flight): C2 · executor contract — raise a fork instead of guessing"
overview: "buildContext injects a mid-flight raise instruction telling the executor to run chalk raise for a fork the criteria don't answer, and to raise only the few that need taste (not flood)"
created: "2026-07-17T10:59:50.215Z"
todos:
  - id: "task-622ec407-c1"
    content: "buildContext injects a mid-flight raise instruction telling the executor to run chalk raise for a fork the criteria don't answer, and to raise only the few that need taste (not flood)"
    status: pending
  - id: "task-622ec407-c2"
    content: "The raise instruction is a LOW-priority elastic context block — present at any realistic budget but first to yield under extreme pressure, so the essential/director/lessons budget the locked context-budget tests pin stays unchanged"
    status: pending
  - id: "task-622ec407-c3"
    content: "Both chalk-executor definitions (shipped share/agents + dogfood .claude/agents) document the raise convention and stay in sync (agents-sync drift gate green)"
    status: pending
---

# feat(director-mid-flight): C2 · executor contract — raise a fork instead of guessing

> state: **in-progress** · phase: discovery

## Objective

- buildContext injects a mid-flight raise instruction telling the executor to run chalk raise for a fork the criteria don't answer, and to raise only the few that need taste (not flood)
- The raise instruction is a LOW-priority elastic context block — present at any realistic budget but first to yield under extreme pressure, so the essential/director/lessons budget the locked context-budget tests pin stays unchanged
- Both chalk-executor definitions (shipped share/agents + dogfood .claude/agents) document the raise convention and stay in sync (agents-sync drift gate green)

## Locked tests (read-only — P6)

- `test/director-raise-contract.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
