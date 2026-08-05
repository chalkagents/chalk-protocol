---
generator: chalk-protocol
id: "task-1b86dfb4"
name: "fix(agents): keep reviewer independence unverified unless explicit"
overview: "`chalk connect` does not synthesize `independenceKey` from adapter or model values."
created: "2026-08-04T11:41:45.608Z"
todos:
  - id: "task-1b86dfb4-c1"
    content: "`chalk connect` does not synthesize `independenceKey` from adapter or model values."
    status: done
  - id: "task-1b86dfb4-c2"
    content: "Distinct providers without explicit keys report reviewer independence as `unverified`, not `distinct`."
    status: done
  - id: "task-1b86dfb4-c3"
    content: "Equal and different explicit keys still report `same` and `distinct` respectively."
    status: done
  - id: "task-1b86dfb4-c4"
    content: "Adapter-reported identity remains opaque to Chalk and may replace missing profile display metadata without being parsed for routing."
    status: done
  - id: "task-1b86dfb4-c5"
    content: "Doctor/connect remediation explains how to configure explicit identity or accept an unverified reviewer without falsely promising that changing providers proves independence."
    status: done
  - id: "task-1b86dfb4-c6"
    content: "Tests cover same, distinct, and unknown identity through the real `chalk connect` path."
    status: done
---

# fix(agents): keep reviewer independence unverified unless explicit

> state: **done** · phase: discovery

## Objective

- `chalk connect` does not synthesize `independenceKey` from adapter or model values.
- Distinct providers without explicit keys report reviewer independence as `unverified`, not `distinct`.
- Equal and different explicit keys still report `same` and `distinct` respectively.
- Adapter-reported identity remains opaque to Chalk and may replace missing profile display metadata without being parsed for routing.
- Doctor/connect remediation explains how to configure explicit identity or accept an unverified reviewer without falsely promising that changing providers proves independence.
- Tests cover same, distinct, and unknown identity through the real `chalk connect` path.

## Locked tests (read-only — P6)

- `test/connect-identity.test.mjs`

## Reviews

- **pass** · 2026-08-04T12:19 · codex
- **stale** · 2026-08-04T21:56 · amend-spec

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
