---
generator: chalk-protocol
id: "task-a7707c81"
name: "fix: chalk release fails loudly on a git-tag error instead of marking work released with no tag"
overview: "in a git repo, a git-tag failure fails chalk release (nonzero) BEFORE marking any task released or writing the CHANGELOG — no phantom version"
created: "2026-07-01T07:39:02.637Z"
todos:
  - id: "task-a7707c81-c1"
    content: "in a git repo, a git-tag failure fails chalk release (nonzero) BEFORE marking any task released or writing the CHANGELOG — no phantom version"
    status: done
  - id: "task-a7707c81-c2"
    content: "the happy path is preserved: a clean release tags and marks tasks released"
    status: done
---

# fix: chalk release fails loudly on a git-tag error instead of marking work released with no tag

> state: **done** · phase: discovery

## Objective

- in a git repo, a git-tag failure fails chalk release (nonzero) BEFORE marking any task released or writing the CHANGELOG — no phantom version
- the happy path is preserved: a clean release tags and marks tasks released

## Locked tests (read-only — P6)

- `test/release-tag.test.mjs`

## Reviews

- **pass** · 2026-07-01T07:41 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
