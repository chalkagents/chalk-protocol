---
generator: chalk-protocol
id: "task-40dcf50f"
name: "feat: release notes — collect merged work, bump version, render notes"
overview: "lib/release.mjs exports releasableTasks(store), bumpVersion(current, tasks, opts), and renderReleaseNotes(tasks, version, date)"
created: "2026-06-28T18:34:37.206Z"
todos:
  - id: "task-40dcf50f-c1"
    content: "lib/release.mjs exports releasableTasks(store), bumpVersion(current, tasks, opts), and renderReleaseNotes(tasks, version, date)"
    status: done
  - id: "task-40dcf50f-c2"
    content: "releasableTasks returns done tasks that have no released marker, oldest-first by doneAt"
    status: done
  - id: "task-40dcf50f-c3"
    content: "bumpVersion: an explicit version/level wins; else major if any task is breaking, minor if any is a feat, else patch; a missing current starts from 0.0.0"
    status: done
  - id: "task-40dcf50f-c4"
    content: "renderReleaseNotes groups tasks by type (Features/Fixes/etc.) under a '## v<version> — <date>' header, lists each with its '(#<pr>)' link when present, and skips empty groups"
    status: done
---

# feat: release notes — collect merged work, bump version, render notes

> state: **done** · phase: discovery

## Objective

- lib/release.mjs exports releasableTasks(store), bumpVersion(current, tasks, opts), and renderReleaseNotes(tasks, version, date)
- releasableTasks returns done tasks that have no released marker, oldest-first by doneAt
- bumpVersion: an explicit version/level wins; else major if any task is breaking, minor if any is a feat, else patch; a missing current starts from 0.0.0
- renderReleaseNotes groups tasks by type (Features/Fixes/etc.) under a '## v<version> — <date>' header, lists each with its '(#<pr>)' link when present, and skips empty groups

## Locked tests (read-only — P6)

- `test/release.test.mjs`

## Reviews

- **pass** · 2026-06-28T18:38 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
