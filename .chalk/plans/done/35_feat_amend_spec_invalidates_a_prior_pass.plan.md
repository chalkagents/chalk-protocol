---
generator: chalk-protocol
id: "task-654cec3c"
name: "feat: amend-spec invalidates a prior passing review (close the weaken-after-approval bypass)"
overview: "amend-spec invalidates a prior passing review — after a locked test changes, done requires a fresh review (closes weaken-after-approval)"
created: "2026-07-01T00:55:34.144Z"
todos:
  - id: "task-654cec3c-c1"
    content: "amend-spec invalidates a prior passing review — after a locked test changes, done requires a fresh review (closes weaken-after-approval)"
    status: done
  - id: "task-654cec3c-c2"
    content: "done --force-review requires --why and logs a decision (auditable, never silent)"
    status: done
---

# feat: amend-spec invalidates a prior passing review (close the weaken-after-approval bypass)

> state: **done** · phase: discovery

## Objective

- amend-spec invalidates a prior passing review — after a locked test changes, done requires a fresh review (closes weaken-after-approval)
- done --force-review requires --why and logs a decision (auditable, never silent)

## Locked tests (read-only — P6)

- `test/amendspec-review.test.mjs`

## Reviews

- **pass** · 2026-07-01T01:03 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
