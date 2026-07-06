---
generator: chalk-protocol
id: "task-10382dc9"
name: "chore: dogfood — make chalk's own loop (issue pull → autopilot → retro) the default way chalk contributes to chalk"
overview: "A documented sweep runbook in the repo (CONTRIBUTING.md or RUNNING-AUTONOMOUSLY.md): issue pull → spec → autopilot → retro, runnable on this repo as-is with the committed `.chalk/chalk.json` agent config."
created: "2026-07-06T09:17:15.842Z"
todos:
  - id: "task-10382dc9-c1"
    content: "A documented sweep runbook in the repo (CONTRIBUTING.md or RUNNING-AUTONOMOUSLY.md): issue pull → spec → autopilot → retro, runnable on this repo as-is with the committed `.chalk/chalk.json` agent config."
    status: pending
  - id: "task-10382dc9-c2"
    content: "`chalk issue pull` → pipeline → merge demonstrably works end-to-end on this repo: at least one real issue from the open backlog lands through it, and the PR/task cross-references the issue."
    status: pending
  - id: "task-10382dc9-c3"
    content: "Retro runs at the end of a sweep and files friction it finds (already wired in autopilot — criterion is that a chalk-on-chalk sweep exercises it and the filed issues reference the dogfood run)."
    status: pending
  - id: "task-10382dc9-c4"
    content: "The dogfooding claim is auditable: some command or doc (e.g. `chalk stats`, once #78 lands) can show what fraction of merged PRs went through the gate vs bypassed it."
    status: pending
---

# chore: dogfood — make chalk's own loop (issue pull → autopilot → retro) the default way chalk contributes to chalk

> state: **specd** · phase: discovery

## Objective

- A documented sweep runbook in the repo (CONTRIBUTING.md or RUNNING-AUTONOMOUSLY.md): issue pull → spec → autopilot → retro, runnable on this repo as-is with the committed `.chalk/chalk.json` agent config.
- `chalk issue pull` → pipeline → merge demonstrably works end-to-end on this repo: at least one real issue from the open backlog lands through it, and the PR/task cross-references the issue.
- Retro runs at the end of a sweep and files friction it finds (already wired in autopilot — criterion is that a chalk-on-chalk sweep exercises it and the filed issues reference the dogfood run).
- The dogfooding claim is auditable: some command or doc (e.g. `chalk stats`, once #78 lands) can show what fraction of merged PRs went through the gate vs bypassed it.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
