---
generator: chalk-protocol
id: "task-b3f1b2f6"
name: "fix: make minimum Node CI fixtures portable"
overview: "The minimum supported Node CI lane passes every first-party adapter and connect fixture without relying on syntax detection added in newer Node releases."
created: "2026-09-11T01:26:05.414Z"
todos:
  - id: "task-b3f1b2f6-c1"
    content: "The minimum supported Node CI lane passes every first-party adapter and connect fixture without relying on syntax detection added in newer Node releases."
    status: done
  - id: "task-b3f1b2f6-c2"
    content: "Fake executable behavior and production adapter semantics remain unchanged on Node 20 and newer."
    status: done
---

# fix: make minimum Node CI fixtures portable

> state: **done** · phase: discovery

## Objective

- The minimum supported Node CI lane passes every first-party adapter and connect fixture without relying on syntax detection added in newer Node releases.
- Fake executable behavior and production adapter semantics remain unchanged on Node 20 and newer.

## Locked tests (read-only — P6)

- `test/connect.test.mjs`
- `test/cost-ledger.test.mjs`

## Reviews

- **pass** · 2026-09-11T01:42 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
