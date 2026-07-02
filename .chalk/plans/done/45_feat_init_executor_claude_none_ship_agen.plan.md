---
generator: chalk-protocol
id: "task-58f6359e"
name: "feat: init --executor claude|none — ship agent templates in share/agents, retrofit via chalk agents --claude"
overview: "share/agents/ ships the four Claude agent definitions as copies of .claude/agents/* minus repo-local skills front-matter, pinned by a drift-gate test that fails if either side changes alone"
created: "2026-07-02T05:01:01.452Z"
todos:
  - id: "task-58f6359e-c1"
    content: "share/agents/ ships the four Claude agent definitions as copies of .claude/agents/* minus repo-local skills front-matter, pinned by a drift-gate test that fails if either side changes alone"
    status: done
  - id: "task-58f6359e-c2"
    content: "chalk init --executor claude installs the four agent files (write-if-absent) and wires executor/planner/retro commands plus review.requiredAt per-task; states the claude-CLI PATH prerequisite"
    status: done
  - id: "task-58f6359e-c3"
    content: "a user-edited installed agent survives re-runs (exists, kept); chalk agents --claude is the retrofit path for already-inited projects"
    status: done
  - id: "task-58f6359e-c4"
    content: "chalk init --executor none prints the first-class manual loop; unknown executor values are refused listing claude|opencode|none"
    status: done
---

# feat: init --executor claude|none — ship agent templates in share/agents, retrofit via chalk agents --claude

> state: **done** · phase: discovery

## Objective

- share/agents/ ships the four Claude agent definitions as copies of .claude/agents/* minus repo-local skills front-matter, pinned by a drift-gate test that fails if either side changes alone
- chalk init --executor claude installs the four agent files (write-if-absent) and wires executor/planner/retro commands plus review.requiredAt per-task; states the claude-CLI PATH prerequisite
- a user-edited installed agent survives re-runs (exists, kept); chalk agents --claude is the retrofit path for already-inited projects
- chalk init --executor none prints the first-class manual loop; unknown executor values are refused listing claude|opencode|none

## Locked tests (read-only — P6)

- `test/agents-sync.test.mjs`

## Reviews

- **block** · 2026-07-02T05:59 · adversary
- **pass** · 2026-07-02T06:02 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
