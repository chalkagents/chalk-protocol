---
generator: chalk-protocol
id: "task-7502f310"
name: "docs(skills): add a chalk-branch-cleanup skill for pruning stale branches"
overview: ".claude/skills/chalk-branch-cleanup/SKILL.md exists with YAML frontmatter (name, description) whose description triggers on 'clean up branches'"
created: "2026-07-13T12:44:37.611Z"
todos:
  - id: "task-7502f310-c1"
    content: ".claude/skills/chalk-branch-cleanup/SKILL.md exists with YAML frontmatter (name, description) whose description triggers on 'clean up branches'"
    status: done
  - id: "task-7502f310-c2"
    content: "Prominently documents that git branch --merged is UNRELIABLE here (squash merges are not ancestors) and PR state must be verified via gh pr list --head <branch> --state all --json state (delete only when MERGED)"
    status: done
  - id: "task-7502f310-c3"
    content: "Includes exact commands: git fetch --prune, git push origin --delete, git branch -vv gone-detection + -D, resync main to origin/main"
    status: done
  - id: "task-7502f310-c4"
    content: "Includes the safety step: never delete an OPEN/no-PR branch without checking git log origin/main..<branch> for unmerged commits first"
    status: done
---

# docs(skills): add a chalk-branch-cleanup skill for pruning stale branches

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-branch-cleanup/SKILL.md exists with YAML frontmatter (name, description) whose description triggers on 'clean up branches'
- Prominently documents that git branch --merged is UNRELIABLE here (squash merges are not ancestors) and PR state must be verified via gh pr list --head <branch> --state all --json state (delete only when MERGED)
- Includes exact commands: git fetch --prune, git push origin --delete, git branch -vv gone-detection + -D, resync main to origin/main
- Includes the safety step: never delete an OPEN/no-PR branch without checking git log origin/main..<branch> for unmerged commits first

## Reviews

- **pass** · 2026-07-13T13:18 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
