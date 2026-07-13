---
generator: chalk-protocol
id: "task-3807fafa"
name: "docs(skills): add a chalk-dogfood skill for contributing to chalk via chalk"
overview: ".claude/skills/chalk-dogfood/SKILL.md exists with YAML frontmatter whose description triggers on 'contribute to chalk'/'dogfood'/'run the loop on chalk itself'"
created: "2026-07-13T12:44:37.598Z"
todos:
  - id: "task-3807fafa-c1"
    content: ".claude/skills/chalk-dogfood/SKILL.md exists with YAML frontmatter whose description triggers on 'contribute to chalk'/'dogfood'/'run the loop on chalk itself'"
    status: done
  - id: "task-3807fafa-c2"
    content: "States issue-backed tasks go through the GitHub pipeline (chalk branch -> work -> commit -> pr -> review -> merge); hand-committing to main skips the PR record and leaves stages stale"
    status: done
  - id: "task-3807fafa-c3"
    content: "Encodes the ordering gotchas: commit issue-intake spine metadata in its OWN chore(spine) commit BEFORE feature work, commit review-fix changes MANUALLY (chalk commit no-ops #134) verifying git status clean + git show --stat HEAD before chalk merge, commit sha256-pinned locked tests in the same change, and reconcile with chore(spine) after out-of-band merges"
    status: done
  - id: "task-3807fafa-c4"
    content: "Links chalk-commit (#141) and chalk-ship (#142)"
    status: done
---

# docs(skills): add a chalk-dogfood skill for contributing to chalk via chalk

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-dogfood/SKILL.md exists with YAML frontmatter whose description triggers on 'contribute to chalk'/'dogfood'/'run the loop on chalk itself'
- States issue-backed tasks go through the GitHub pipeline (chalk branch -> work -> commit -> pr -> review -> merge); hand-committing to main skips the PR record and leaves stages stale
- Encodes the ordering gotchas: commit issue-intake spine metadata in its OWN chore(spine) commit BEFORE feature work, commit review-fix changes MANUALLY (chalk commit no-ops #134) verifying git status clean + git show --stat HEAD before chalk merge, commit sha256-pinned locked tests in the same change, and reconcile with chore(spine) after out-of-band merges
- Links chalk-commit (#141) and chalk-ship (#142)

## Reviews

- **pass** · 2026-07-13T13:39 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
