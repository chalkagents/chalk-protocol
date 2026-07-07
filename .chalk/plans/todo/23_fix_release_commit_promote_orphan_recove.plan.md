---
generator: chalk-protocol
id: "task-a6173700"
name: "fix: release --commit/--promote orphan recovery keys on an un-namespaced \"Released vX\" substring over decisions.md"
overview: "Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume."
created: "2026-07-07T09:50:24.960Z"
todos:
  - id: "task-a6173700-c1"
    content: "Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume."
    status: pending
  - id: "task-a6173700-c2"
    content: "Detect the orphan by version/tag rather than a fixed `log -50` depth, or document and test the bound so a deeper orphan can't silently double-bump."
    status: pending
  - id: "task-a6173700-c3"
    content: "Locked test: a manual decision note whose body contains \"Released vX.Y.Z\" does NOT block resuming a genuinely orphaned release commit."
    status: pending
---

# fix: release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md

> state: **specd** · phase: discovery

## Objective

- Match the completion marker namespaced to the specific commit/version (a dedicated marker or structured decision field), not a bare substring over shared prose, so unrelated text can neither spoof nor suppress a resume.
- Detect the orphan by version/tag rather than a fixed `log -50` depth, or document and test the bound so a deeper orphan can't silently double-bump.
- Locked test: a manual decision note whose body contains "Released vX.Y.Z" does NOT block resuming a genuinely orphaned release commit.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
