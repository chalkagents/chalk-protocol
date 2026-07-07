---
generator: chalk-protocol
id: "task-4d462e08"
name: "feat: chalk stats — gate-efficacy report from the event log"
overview: "chalk stats reads tasks and events from the live spine AND .chalk/archive/, and reports review-gate efficacy: reviewed-task count, tasks blocked at least once before passing (catches), total block verdicts, and findings broken down by severity and by area"
created: "2026-07-06T10:05:49.988Z"
todos:
  - id: "task-4d462e08-c1"
    content: "chalk stats reads tasks and events from the live spine AND .chalk/archive/, and reports review-gate efficacy: reviewed-task count, tasks blocked at least once before passing (catches), total block verdicts, and findings broken down by severity and by area"
    status: done
  - id: "task-4d462e08-c2"
    content: "It reports churn: executor attempts and handoffs (totals and the worst offenders), and counts verify-RED blocks from the event log"
    status: done
  - id: "task-4d462e08-c3"
    content: "It reports the gate-vs-bypass fraction over done tasks: the share that passed adversarial review vs done via review override (Overrode review gate decisions) or with no review, and the share landed through the pipeline (pipeline stage merged/cleaned) vs hand-landed"
    status: done
  - id: "task-4d462e08-c4"
    content: "chalk stats --json emits the same report as machine-readable JSON; --since <date> restricts to tasks done and events emitted at/after that date; the command is pure read (never writes the spine), zero new dependencies"
    status: done
  - id: "task-4d462e08-c5"
    content: "On a fresh spine with no tasks or events it prints a friendly empty-state message and exits 0 instead of throwing"
    status: done
---

# feat: chalk stats — gate-efficacy report from the event log

> state: **done** · phase: discovery

## Objective

- chalk stats reads tasks and events from the live spine AND .chalk/archive/, and reports review-gate efficacy: reviewed-task count, tasks blocked at least once before passing (catches), total block verdicts, and findings broken down by severity and by area
- It reports churn: executor attempts and handoffs (totals and the worst offenders), and counts verify-RED blocks from the event log
- It reports the gate-vs-bypass fraction over done tasks: the share that passed adversarial review vs done via review override (Overrode review gate decisions) or with no review, and the share landed through the pipeline (pipeline stage merged/cleaned) vs hand-landed
- chalk stats --json emits the same report as machine-readable JSON; --since <date> restricts to tasks done and events emitted at/after that date; the command is pure read (never writes the spine), zero new dependencies
- On a fresh spine with no tasks or events it prints a friendly empty-state message and exits 0 instead of throwing

## Locked tests (read-only — P6)

- `test/stats.test.mjs`

## Reviews

- **block** · 2026-07-06T10:18 · adversary
- **pass** · 2026-07-06T10:27 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
