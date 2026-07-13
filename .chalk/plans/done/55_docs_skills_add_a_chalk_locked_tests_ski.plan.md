---
generator: chalk-protocol
id: "task-86cb4f90"
name: "docs(skills): add a chalk-locked-tests skill for the pin/amend test workflow"
overview: ".claude/skills/chalk-locked-tests/SKILL.md exists with YAML frontmatter whose description triggers on 'lock a test'/'amend spec'/'test integrity'"
created: "2026-07-13T12:44:37.609Z"
todos:
  - id: "task-86cb4f90-c1"
    content: ".claude/skills/chalk-locked-tests/SKILL.md exists with YAML frontmatter whose description triggers on 'lock a test'/'amend spec'/'test integrity'"
    status: done
  - id: "task-86cb4f90-c2"
    content: "Documents the create->pin->commit sequence: author a fail-first test, chalk spec --test <path> to sha256-lock, and commit the lock in the SAME change (untracked lock ships a vacuous green)"
    status: done
  - id: "task-86cb4f90-c3"
    content: "Documents chalk amend-spec <id> --test <path> --why as the ONLY sanctioned way to change a locked test, that it STALES any prior passing review (fresh review required before done), and to amend only AFTER the suite is green"
    status: done
  - id: "task-86cb4f90-c4"
    content: "States locked files are read-only: never edit/weaken/delete/rename directly; put a real asserting test for CLI-wiring/e2e criteria IN the locked file"
    status: done
---

# docs(skills): add a chalk-locked-tests skill for the pin/amend test workflow

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-locked-tests/SKILL.md exists with YAML frontmatter whose description triggers on 'lock a test'/'amend spec'/'test integrity'
- Documents the create->pin->commit sequence: author a fail-first test, chalk spec --test <path> to sha256-lock, and commit the lock in the SAME change (untracked lock ships a vacuous green)
- Documents chalk amend-spec <id> --test <path> --why as the ONLY sanctioned way to change a locked test, that it STALES any prior passing review (fresh review required before done), and to amend only AFTER the suite is green
- States locked files are read-only: never edit/weaken/delete/rename directly; put a real asserting test for CLI-wiring/e2e criteria IN the locked file

## Reviews

- **pass** · 2026-07-13T13:22 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
