---
generator: chalk-protocol
id: "task-9f631779"
name: "docs(skills): add a chalk-autopilot-setup skill for readying an unattended run"
overview: ".claude/skills/chalk-autopilot-setup/SKILL.md exists with YAML frontmatter whose description triggers on 'set up autopilot'/'ready for unattended'/'chalk doctor fails'/'resume after churn'"
created: "2026-07-13T12:44:37.595Z"
todos:
  - id: "task-9f631779-c1"
    content: ".claude/skills/chalk-autopilot-setup/SKILL.md exists with YAML frontmatter whose description triggers on 'set up autopilot'/'ready for unattended'/'chalk doctor fails'/'resume after churn'"
    status: done
  - id: "task-9f631779-c2"
    content: "Provides a chalk doctor FAIL/WARN -> fix table: set executor.command, configure a reviewer (avoid same-model as executor — self-preference bias), lock tests on runnable tasks, set worktree.setup"
    status: done
  - id: "task-9f631779-c3"
    content: "Documents held-out isolation (P7, #82): gitignored in-repo dir hidden by a worktree, OR a manual-mode path OUTSIDE the repo root; and the vacuous-verify guard (empty protocol.verify prints GREEN checking nothing)"
    status: done
  - id: "task-9f631779-c4"
    content: "Documents churn/handoff resume: exceeding handoff.maxAttempts (default 3) writes .chalk/handoffs/<id>-N.md; resume in a FRESH session with chalk context <id>"
    status: done
---

# docs(skills): add a chalk-autopilot-setup skill for readying an unattended run

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-autopilot-setup/SKILL.md exists with YAML frontmatter whose description triggers on 'set up autopilot'/'ready for unattended'/'chalk doctor fails'/'resume after churn'
- Provides a chalk doctor FAIL/WARN -> fix table: set executor.command, configure a reviewer (avoid same-model as executor — self-preference bias), lock tests on runnable tasks, set worktree.setup
- Documents held-out isolation (P7, #82): gitignored in-repo dir hidden by a worktree, OR a manual-mode path OUTSIDE the repo root; and the vacuous-verify guard (empty protocol.verify prints GREEN checking nothing)
- Documents churn/handoff resume: exceeding handoff.maxAttempts (default 3) writes .chalk/handoffs/<id>-N.md; resume in a FRESH session with chalk context <id>

## Reviews

- **pass** · 2026-07-13T13:43 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
