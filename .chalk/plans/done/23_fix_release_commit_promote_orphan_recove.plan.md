---
generator: chalk-protocol
id: "task-a6173700"
name: "fix: release --commit/--promote orphan recovery keys on an un-namespaced \"Released vX\" substring over decisions.md"
overview: "Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume."
created: "2026-07-07T09:50:24.960Z"
todos:
  - id: "task-a6173700-c1"
    content: "Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume."
    status: done
  - id: "task-a6173700-c2"
    content: "Detect the orphan by version/tag rather than a fixed `log -50` depth, or document and test the bound so a deeper orphan can't silently double-bump."
    status: done
  - id: "task-a6173700-c3"
    content: "Locked test: a manual decision note whose body contains \"Released vX.Y.Z\" does NOT block resuming a genuinely orphaned release commit."
    status: done
  - id: "task-a6173700-c4"
    content: "The release completion marker is matched anchored to the '## Released vX' decision HEADING (multiline ^…$), not as a bare substring over decisions.md — so prose in any decision body mentioning 'Released vX' can neither spoof completion nor suppress a legitimate resume."
    status: done
  - id: "task-a6173700-c5"
    content: "The orphaned release commit is detected via git's own --grep at ANY depth (not a fixed log -50 window), so a deeply-buried orphan can't silently revert to bump-from-bumped."
    status: done
  - id: "task-a6173700-c6"
    content: "A genuine finished release (real ## Released heading + tag) still suppresses the resume — no false resume onto a completed release."
    status: done
  - id: "task-a6173700-c7"
    content: "Locked test proves: a decision body mentioning 'Released vX' does not block resuming a genuine orphan, a real heading does, and an orphan buried beyond 50 commits is still found."
    status: done
---

# fix: release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md

> state: **done** · phase: discovery

## Objective

- Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume.
- Detect the orphan by version/tag rather than a fixed `log -50` depth, or document and test the bound so a deeper orphan can't silently double-bump.
- Locked test: a manual decision note whose body contains "Released vX.Y.Z" does NOT block resuming a genuinely orphaned release commit.
- The release completion marker is matched anchored to the '## Released vX' decision HEADING (multiline ^…$), not as a bare substring over decisions.md — so prose in any decision body mentioning 'Released vX' can neither spoof completion nor suppress a legitimate resume.
- The orphaned release commit is detected via git's own --grep at ANY depth (not a fixed log -50 window), so a deeply-buried orphan can't silently revert to bump-from-bumped.
- A genuine finished release (real ## Released heading + tag) still suppresses the resume — no false resume onto a completed release.
- Locked test proves: a decision body mentioning 'Released vX' does not block resuming a genuine orphan, a real heading does, and an orphan buried beyond 50 commits is still found.

## Locked tests (read-only — P6)

- `test/release-marker-scope.test.mjs`

## Reviews

- **block** · 2026-07-07T10:49 · adversary
- **pass** · 2026-07-07T11:03 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
