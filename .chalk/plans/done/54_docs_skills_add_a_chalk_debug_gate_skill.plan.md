---
generator: chalk-protocol
id: "task-d14e3648"
name: "docs(skills): add a chalk-debug-gate skill for diagnosing RED verify / review BLOCK / audit RED"
overview: ".claude/skills/chalk-debug-gate/SKILL.md exists with YAML frontmatter whose description triggers on 'verify red'/'review blocked'/'audit failed'/'cant mark done'"
created: "2026-07-13T12:44:37.606Z"
todos:
  - id: "task-d14e3648-c1"
    content: ".claude/skills/chalk-debug-gate/SKILL.md exists with YAML frontmatter whose description triggers on 'verify red'/'review blocked'/'audit failed'/'cant mark done'"
    status: done
  - id: "task-d14e3648-c2"
    content: "Provides a symptom -> gate -> remediation decision tree covering RED verify (toolchain vs test-integrity VIOLATED vs e2e), review BLOCK, audit RED (P7), and done-gate refusals (P4/P6/P5)"
    status: done
  - id: "task-d14e3648-c3"
    content: "States review BLOCK is agent-owned (needs:review, not a human dep): fix findings, git commit MANUALLY (chalk commit no-ops #134), re-run chalk review, chalk unblock clears it (#117)"
    status: done
  - id: "task-d14e3648-c4"
    content: "States audit RED tells you ONLY that a criterion regressed, never the held-out assertion: fix against the spec, never inspect .chalk/held-out/"
    status: done
---

# docs(skills): add a chalk-debug-gate skill for diagnosing RED verify / review BLOCK / audit RED

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-debug-gate/SKILL.md exists with YAML frontmatter whose description triggers on 'verify red'/'review blocked'/'audit failed'/'cant mark done'
- Provides a symptom -> gate -> remediation decision tree covering RED verify (toolchain vs test-integrity VIOLATED vs e2e), review BLOCK, audit RED (P7), and done-gate refusals (P4/P6/P5)
- States review BLOCK is agent-owned (needs:review, not a human dep): fix findings, git commit MANUALLY (chalk commit no-ops #134), re-run chalk review, chalk unblock clears it (#117)
- States audit RED tells you ONLY that a criterion regressed, never the held-out assertion: fix against the spec, never inspect .chalk/held-out/

## Reviews

- **pass** · 2026-07-13T13:25 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
