---
generator: chalk-protocol
id: "task-f1308f82"
name: "fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips"
overview: "On a post-commit tag failure, either roll the release commit back (`git reset --hard HEAD~1` is safe — the commit contains only the release artifacts) or make the re-run detect the orphaned release commit and tag it instead of re-bumping"
created: "2026-07-06T08:12:17.234Z"
todos:
  - id: "task-f1308f82-c1"
    content: "On a post-commit tag failure, either roll the release commit back (`git reset --hard HEAD~1` is safe — the commit contains only the release artifacts) or make the re-run detect the orphaned release commit and tag it instead of re-bumping"
    status: done
  - id: "task-f1308f82-c2"
    content: "Test the recovery path (tag fails once after the commit → next run converges on ONE release commit + tag)"
    status: done
  - id: "task-f1308f82-c3"
    content: "While there: cover `--commit --no-tag` (commits the bump, skips the probe) with a test"
    status: done
---

# fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips

> state: **done** · phase: discovery

## Objective

- On a post-commit tag failure, either roll the release commit back (`git reset --hard HEAD~1` is safe — the commit contains only the release artifacts) or make the re-run detect the orphaned release commit and tag it instead of re-bumping
- Test the recovery path (tag fails once after the commit → next run converges on ONE release commit + tag)
- While there: cover `--commit --no-tag` (commits the bump, skips the probe) with a test

## Locked tests (read-only — P6)

- `test/release-recovery.test.mjs`

## Reviews

- **block** · 2026-07-06T08:19 · adversary
- **pass** · 2026-07-06T08:25 · adversary
- **stale** · 2026-07-06T08:25 · amend-spec
- **pass** · 2026-07-06T08:28 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
