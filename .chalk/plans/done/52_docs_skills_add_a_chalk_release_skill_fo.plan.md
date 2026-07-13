---
generator: chalk-protocol
id: "task-d450bc60"
name: "docs(skills): add a chalk-release skill for the release + protected-deploy flow"
overview: ".claude/skills/chalk-release/SKILL.md exists with YAML frontmatter whose description triggers on 'cut a release'/'promote release'/'release stuck'"
created: "2026-07-13T12:44:37.601Z"
todos:
  - id: "task-d450bc60-c1"
    content: ".claude/skills/chalk-release/SKILL.md exists with YAML frontmatter whose description triggers on 'cut a release'/'promote release'/'release stuck'"
    status: done
  - id: "task-d450bc60-c2"
    content: "Documents chalk release --commit (release commit + tag, orphan-resume via git log --grep at any depth, #125) vs --promote (base->deployBase promotion PR, CI poll, merge, tag deploy tip, #98; requires base != deployBase)"
    status: done
  - id: "task-d450bc60-c3"
    content: "Documents the --version semantics + version-collision probing, and the CI-poll knobs ciPollIntervalMs / ciPollAttempts (default ~5s x 24)"
    status: done
  - id: "task-d450bc60-c4"
    content: "Documents how to safely re-run after an interruption at each step (idempotent resume)"
    status: done
---

# docs(skills): add a chalk-release skill for the release + protected-deploy flow

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-release/SKILL.md exists with YAML frontmatter whose description triggers on 'cut a release'/'promote release'/'release stuck'
- Documents chalk release --commit (release commit + tag, orphan-resume via git log --grep at any depth, #125) vs --promote (base->deployBase promotion PR, CI poll, merge, tag deploy tip, #98; requires base != deployBase)
- Documents the --version semantics + version-collision probing, and the CI-poll knobs ciPollIntervalMs / ciPollAttempts (default ~5s x 24)
- Documents how to safely re-run after an interruption at each step (idempotent resume)

## Reviews

- **block** · 2026-07-13T13:31 · adversary
- **pass** · 2026-07-13T13:36 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
