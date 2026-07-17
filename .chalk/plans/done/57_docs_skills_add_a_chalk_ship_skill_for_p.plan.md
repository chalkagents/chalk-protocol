---
generator: chalk-protocol
id: "task-c81bb14c"
name: "docs(skills): add a chalk-ship skill for pushing and landing PRs safely"
overview: ".claude/skills/chalk-ship/SKILL.md exists with YAML frontmatter (name: chalk-ship, description) whose description triggers on 'push'/'open PR'/'land'"
created: "2026-07-13T12:44:37.614Z"
todos:
  - id: "task-c81bb14c-c1"
    content: ".claude/skills/chalk-ship/SKILL.md exists with YAML frontmatter (name: chalk-ship, description) whose description triggers on 'push'/'open PR'/'land'"
    status: done
  - id: "task-c81bb14c-c2"
    content: "Documents the single-PR path (normal squash-merge when nothing stacks)"
    status: done
  - id: "task-c81bb14c-c3"
    content: "Documents the stacked-PR --delete-branch trap and the bottom-up A<-B<-C landing procedure with exact gh commands (merge without --delete-branch, gh pr edit --base, retarget children, delete branches last)"
    status: done
  - id: "task-c81bb14c-c4"
    content: "Includes the pre-merge committed-fix check (ties to #134) and cross-references chalk-commit"
    status: done
---

# docs(skills): add a chalk-ship skill for pushing and landing PRs safely

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-ship/SKILL.md exists with YAML frontmatter (name: chalk-ship, description) whose description triggers on 'push'/'open PR'/'land'
- Documents the single-PR path (normal squash-merge when nothing stacks)
- Documents the stacked-PR --delete-branch trap and the bottom-up A<-B<-C landing procedure with exact gh commands (merge without --delete-branch, gh pr edit --base, retarget children, delete branches last)
- Includes the pre-merge committed-fix check (ties to #134) and cross-references chalk-commit

## Reviews

- **pass** · 2026-07-13T13:16 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
