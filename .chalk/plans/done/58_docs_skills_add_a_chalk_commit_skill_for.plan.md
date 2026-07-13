---
generator: chalk-protocol
id: "task-1a995ac3"
name: "docs(skills): add a chalk-commit skill for uniform commit discipline"
overview: ".claude/skills/chalk-commit/SKILL.md exists with YAML frontmatter (name: chalk-commit, description) whose description triggers on 'commit'/'save changes'"
created: "2026-07-13T12:44:37.616Z"
todos:
  - id: "task-1a995ac3-c1"
    content: ".claude/skills/chalk-commit/SKILL.md exists with YAML frontmatter (name: chalk-commit, description) whose description triggers on 'commit'/'save changes'"
    status: done
  - id: "task-1a995ac3-c2"
    content: "Documents conventional-commit format (types, imperative, <=70 chars, no period), the chore(spine): reconcile pattern, and the Closes #n body convention"
    status: done
  - id: "task-1a995ac3-c3"
    content: "Documents the chalk commit no-op hazard (#134) with an explicit manual-commit-after-review checklist (git add/commit, verify git status clean + git show --stat HEAD before chalk merge)"
    status: done
  - id: "task-1a995ac3-c4"
    content: "States the Co-Authored-By policy: omitted on pipeline-agent commits, applied on human/main-loop commits; includes a concrete example commit and cross-references chalk-conventions"
    status: done
---

# docs(skills): add a chalk-commit skill for uniform commit discipline

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-commit/SKILL.md exists with YAML frontmatter (name: chalk-commit, description) whose description triggers on 'commit'/'save changes'
- Documents conventional-commit format (types, imperative, <=70 chars, no period), the chore(spine): reconcile pattern, and the Closes #n body convention
- Documents the chalk commit no-op hazard (#134) with an explicit manual-commit-after-review checklist (git add/commit, verify git status clean + git show --stat HEAD before chalk merge)
- States the Co-Authored-By policy: omitted on pipeline-agent commits, applied on human/main-loop commits; includes a concrete example commit and cross-references chalk-conventions

## Reviews

- **block** · 2026-07-13T12:51 · adversary
- **block** · 2026-07-13T13:07 · adversary
- **pass** · 2026-07-13T13:08 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
