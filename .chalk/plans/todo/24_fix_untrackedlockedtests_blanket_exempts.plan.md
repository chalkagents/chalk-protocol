---
generator: chalk-protocol
id: "task-f64af30f"
name: "fix: untrackedLockedTests blanket-exempts every `.chalk/` pin, so an untracked e2e acceptance spec ships a vacuous green"
overview: "Narrow the exclusion so genuine spine-state files (tasks.json/chalk.json/board) are exempt but pinned e2e spec paths under `.chalk/tests/` are still tracking-checked"
created: "2026-07-07T09:50:24.961Z"
todos:
  - id: "task-f64af30f-c1"
    content: "Narrow the exclusion so genuine spine-state files (tasks.json/chalk.json/board) are exempt but pinned e2e spec paths under `.chalk/tests/` are still tracking-checked"
    status: pending
  - id: "task-f64af30f-c2"
    content: "Add a locked test: a task pinning an untracked `.chalk/tests/*.test.yaml` spec is reported by `untrackedLockedTests` and blocks `chalk done`/`chalk pr`"
    status: pending
  - id: "task-f64af30f-c3"
    content: "Add a test that a real spine-state path (e.g. `.chalk/tasks.json`) remains exempt"
    status: pending
---

# fix: untrackedLockedTests blanket-exempts every `.chalk/` pin, so an untracked e2e acceptance spec ships a vacuous green

> state: **specd** · phase: discovery

## Objective

- Narrow the exclusion so genuine spine-state files (tasks.json/chalk.json/board) are exempt but pinned e2e spec paths under `.chalk/tests/` are still tracking-checked
- Add a locked test: a task pinning an untracked `.chalk/tests/*.test.yaml` spec is reported by `untrackedLockedTests` and blocks `chalk done`/`chalk pr`
- Add a test that a real spine-state path (e.g. `.chalk/tasks.json`) remains exempt

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
