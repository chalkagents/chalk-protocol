---
generator: chalk-protocol
id: "task-bb33a342"
name: "feat: chalk approve-plan gate — work refuses an unapproved required plan"
overview: "lib/planning.mjs exports planApprovalRequired(store, task) = protocol.plan.required && !task.planApproved"
created: "2026-06-28T17:14:58.797Z"
todos:
  - id: "task-bb33a342-c1"
    content: "lib/planning.mjs exports planApprovalRequired(store, task) = protocol.plan.required && !task.planApproved"
    status: done
  - id: "task-bb33a342-c2"
    content: "chalk approve-plan <id> sets task.planApproved {at, by}; refuses if the task has no plan, or has open scoping questions (resolve them first) unless --force --why"
    status: done
  - id: "task-bb33a342-c3"
    content: "when protocol.plan.required, chalk work refuses (exit 2) an unapproved plan with a diagnosable reason; an approved plan lets work proceed"
    status: done
  - id: "task-bb33a342-c4"
    content: "the run loop blocks an unapproved required plan (needs:human-input) with a handoff instead of running the executor"
    status: done
  - id: "task-bb33a342-c5"
    content: "protocol.plan default is { required: false } in store.mjs init defaults (opt-in; existing flows unaffected)"
    status: done
---

# feat: chalk approve-plan gate — work refuses an unapproved required plan

> state: **done** · phase: discovery

## Objective

- lib/planning.mjs exports planApprovalRequired(store, task) = protocol.plan.required && !task.planApproved
- chalk approve-plan <id> sets task.planApproved {at, by}; refuses if the task has no plan, or has open scoping questions (resolve them first) unless --force --why
- when protocol.plan.required, chalk work refuses (exit 2) an unapproved plan with a diagnosable reason; an approved plan lets work proceed
- the run loop blocks an unapproved required plan (needs:human-input) with a handoff instead of running the executor
- protocol.plan default is { required: false } in store.mjs init defaults (opt-in; existing flows unaffected)

## Locked tests (read-only — P6)

- `test/approveplan.test.mjs`

## Reviews

- **pass** · 2026-06-28T18:22 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
