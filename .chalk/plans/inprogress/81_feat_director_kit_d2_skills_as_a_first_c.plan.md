---
generator: chalk-protocol
id: "task-0547837d"
name: "feat(director-kit): D2 · skills as a first-class part (.chalk/skills → context)"
overview: "chalk skill add \"<name>\" [--file <path> | \"<text>\"] writes .chalk/skills/<slug>.md; chalk skill (no sub) lists them; an empty skill is refused"
created: "2026-07-17T12:22:11.126Z"
todos:
  - id: "task-0547837d-c1"
    content: "chalk skill add \"<name>\" [--file <path> | \"<text>\"] writes .chalk/skills/<slug>.md; chalk skill (no sub) lists them; an empty skill is refused"
    status: pending
  - id: "task-0547837d-c2"
    content: "buildContext injects a '## Project skills (apply these)' block from .chalk/skills/*.md, each skill a titled section with its content — the affirmative playbook, distinct from lessons"
    status: pending
  - id: "task-0547837d-c3"
    content: "The skills block is elastic — present at a realistic budget, dropped under extreme pressure while essentials survive (does not disturb the locked context-budget tests)"
    status: pending
  - id: "task-0547837d-c4"
    content: ".chalk/skills is spine state (in SPINE_STATE_PATHS — committed by intake, excluded from review diffs), consistent with lessons.md"
    status: pending
---

# feat(director-kit): D2 · skills as a first-class part (.chalk/skills → context)

> state: **in-progress** · phase: discovery

## Objective

- chalk skill add "<name>" [--file <path> | "<text>"] writes .chalk/skills/<slug>.md; chalk skill (no sub) lists them; an empty skill is refused
- buildContext injects a '## Project skills (apply these)' block from .chalk/skills/*.md, each skill a titled section with its content — the affirmative playbook, distinct from lessons
- The skills block is elastic — present at a realistic budget, dropped under extreme pressure while essentials survive (does not disturb the locked context-budget tests)
- .chalk/skills is spine state (in SPINE_STATE_PATHS — committed by intake, excluded from review diffs), consistent with lessons.md

## Locked tests (read-only — P6)

- `test/director-skills.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
