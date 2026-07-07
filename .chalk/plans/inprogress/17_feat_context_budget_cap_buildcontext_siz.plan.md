---
generator: chalk-protocol
id: "task-2c8e0e36"
name: "feat: context budget — cap buildContext size and prune injected lessons"
overview: "protocol.contextBudget (bytes, generous default) caps the size of the chalk context blob; only the elastic lessons block is trimmed to fit — unset uses the default."
created: "2026-07-06T10:05:49.986Z"
todos:
  - id: "task-2c8e0e36-c1"
    content: "protocol.contextBudget (bytes, generous default) caps the size of the chalk context blob; only the elastic lessons block is trimmed to fit — unset uses the default."
    status: pending
  - id: "task-2c8e0e36-c2"
    content: "The task's essentials are never sacrificed for budget: acceptance criteria, locked tests, handoff, prior-review findings, and the contract are always present regardless of budget."
    status: pending
  - id: "task-2c8e0e36-c3"
    content: "Under budget pressure the OLDEST lessons are elided first (most-recent kept) and a note reports how many were dropped and how to raise the budget."
    status: pending
  - id: "task-2c8e0e36-c4"
    content: "Locked test proves: a tiny budget elides older lessons (note + newest survive, essentials intact), a generous/default budget keeps all lessons, and an extreme budget drops all lessons while criteria + contract remain."
    status: pending
---

# feat: context budget — cap buildContext size and prune injected lessons

> state: **in-progress** · phase: discovery

## Objective

- protocol.contextBudget (bytes, generous default) caps the size of the chalk context blob; only the elastic lessons block is trimmed to fit — unset uses the default.
- The task's essentials are never sacrificed for budget: acceptance criteria, locked tests, handoff, prior-review findings, and the contract are always present regardless of budget.
- Under budget pressure the OLDEST lessons are elided first (most-recent kept) and a note reports how many were dropped and how to raise the budget.
- Locked test proves: a tiny budget elides older lessons (note + newest survive, essentials intact), a generous/default budget keeps all lessons, and an extreme budget drops all lessons while criteria + contract remain.

## Locked tests (read-only — P6)

- `test/context-budget.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
