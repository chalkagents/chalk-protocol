---
generator: chalk-protocol
id: "task-2563a7a0"
name: "feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)"
overview: "run the `--commit --no-tag` flow on the integration branch (github.base)"
created: "2026-07-06T08:12:17.231Z"
todos:
  - id: "task-2563a7a0-c1"
    content: "run the `--commit --no-tag` flow on the integration branch (github.base)"
    status: done
  - id: "task-2563a7a0-c2"
    content: "open the promotion PR to the deploy branch (new config, e.g. `github.deployBase` or `release.promoteTo`), wait for CI, merge with a MERGE commit regardless of github.mergeMethod"
    status: done
  - id: "task-2563a7a0-c3"
    content: "tag the deploy branch's tip vX.Y.Z and push the tag"
    status: done
  - id: "task-2563a7a0-c4"
    content: "collision/idempotency safety consistent with #93 and #91 (a failed step must not mark tasks released or strand a half-promoted release)"
    status: done
---

# feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)

> state: **done** · phase: discovery

## Objective

- run the `--commit --no-tag` flow on the integration branch (github.base)
- open the promotion PR to the deploy branch (new config, e.g. `github.deployBase` or `release.promoteTo`), wait for CI, merge with a MERGE commit regardless of github.mergeMethod
- tag the deploy branch's tip vX.Y.Z and push the tag
- collision/idempotency safety consistent with #93 and #91 (a failed step must not mark tasks released or strand a half-promoted release)

## Locked tests (read-only — P6)

- `test/release-promote.test.mjs`

## Reviews

- **block** · 2026-07-06T08:39 · adversary
- **pass** · 2026-07-06T08:47 · adversary
- **stale** · 2026-07-06T08:48 · amend-spec
- **pass** · 2026-07-06T08:51 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
