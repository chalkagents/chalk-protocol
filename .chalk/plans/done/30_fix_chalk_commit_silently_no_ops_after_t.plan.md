---
generator: chalk-protocol
id: "task-90b8101a"
name: "fix: chalk commit silently no-ops after the first commit, so review-fix changes never get committed"
overview: "chalk commit commits new working-tree code changes even past the 'committed' stage (labeled follow-up), so review-fix changes land in git."
created: "2026-07-07T11:12:53.780Z"
todos:
  - id: "task-90b8101a-c1"
    content: "chalk commit commits new working-tree code changes even past the 'committed' stage (labeled follow-up), so review-fix changes land in git."
    status: done
  - id: "task-90b8101a-c2"
    content: "It no-ops idempotently when there is nothing new; the first commit still errors when the executor produced no changes."
    status: done
  - id: "task-90b8101a-c3"
    content: "After a follow-up commit no uncommitted CODE lingers — reviewer's view equals what merge takes."
    status: done
  - id: "task-90b8101a-c4"
    content: "Locked test proves first commit, follow-up landing, idempotent re-run, and empty-first-commit failure."
    status: done
---

# fix: chalk commit silently no-ops after the first commit, so review-fix changes never get committed

> state: **done** · phase: discovery

## Objective

- chalk commit commits new working-tree code changes even past the 'committed' stage (labeled follow-up), so review-fix changes land in git.
- It no-ops idempotently when there is nothing new; the first commit still errors when the executor produced no changes.
- After a follow-up commit no uncommitted CODE lingers — reviewer's view equals what merge takes.
- Locked test proves first commit, follow-up landing, idempotent re-run, and empty-first-commit failure.

## Locked tests (read-only — P6)

- `test/commit-followup.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
