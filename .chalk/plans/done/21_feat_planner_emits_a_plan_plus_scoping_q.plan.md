---
generator: chalk-protocol
id: "task-18bbd5ec"
name: "feat: planner emits a plan plus scoping questions"
overview: "lib/planning.mjs exports extractQuestions(planText) returning an array of clarifying-question strings"
created: "2026-06-28T17:14:58.744Z"
todos:
  - id: "task-18bbd5ec-c1"
    content: "lib/planning.mjs exports extractQuestions(planText) returning an array of clarifying-question strings"
    status: done
  - id: "task-18bbd5ec-c2"
    content: "extractQuestions pulls questions from a '## Questions'/'## Open questions' section AND from explicit 'Q:'/'QUESTION:' lines; it trims, strips checkbox prefixes, dedupes, and drops empties"
    status: done
  - id: "task-18bbd5ec-c3"
    content: "chalk plan, after storing task.plan, records each extracted question to questions.json (status open, awaitingFrom 'human', taskId set)"
    status: done
  - id: "task-18bbd5ec-c4"
    content: "chalk plan reports how many scoping questions were captured"
    status: done
---

# feat: planner emits a plan plus scoping questions

> state: **done** · phase: discovery

## Objective

- lib/planning.mjs exports extractQuestions(planText) returning an array of clarifying-question strings
- extractQuestions pulls questions from a '## Questions'/'## Open questions' section AND from explicit 'Q:'/'QUESTION:' lines; it trims, strips checkbox prefixes, dedupes, and drops empties
- chalk plan, after storing task.plan, records each extracted question to questions.json (status open, awaitingFrom 'human', taskId set)
- chalk plan reports how many scoping questions were captured

## Locked tests (read-only — P6)

- `test/planning.test.mjs`

## Reviews

- **pass** · 2026-06-28T18:17 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
