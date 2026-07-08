---
generator: chalk-protocol
id: "task-cc689423"
name: "refactor: unify the intake-commit spine paths and the reviewer diff-exclude list into one shared constant"
overview: "Define the spine-state path list once in a shared module imported by both bin/chalk.mjs (intake commit) and lib/review.mjs (diff excludes)"
created: "2026-07-07T11:12:53.784Z"
todos:
  - id: "task-cc689423-c1"
    content: "Define the spine-state path list once in a shared module imported by both bin/chalk.mjs (intake commit) and lib/review.mjs (diff excludes)"
    status: done
  - id: "task-cc689423-c2"
    content: "Ensure the intake commit covers every spine path the reviewer excludes (contract artifacts like `.chalk/tests/` and `.chalk/evidence/` remain visible/committed as today)"
    status: done
  - id: "task-cc689423-c3"
    content: "Add a test asserting the intake-commit path set and the reviewer-exclude set stay consistent, so a future divergence trips the suite"
    status: done
---

# refactor: unify the intake-commit spine paths and the reviewer diff-exclude list into one shared constant

> state: **done** · phase: discovery

## Objective

- Define the spine-state path list once in a shared module imported by both bin/chalk.mjs (intake commit) and lib/review.mjs (diff excludes)
- Ensure the intake commit covers every spine path the reviewer excludes (contract artifacts like `.chalk/tests/` and `.chalk/evidence/` remain visible/committed as today)
- Add a test asserting the intake-commit path set and the reviewer-exclude set stay consistent, so a future divergence trips the suite

## Reviews

- **pass** · 2026-07-08T14:39 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
