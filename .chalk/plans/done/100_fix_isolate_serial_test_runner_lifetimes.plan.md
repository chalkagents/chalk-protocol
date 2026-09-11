---
generator: chalk-protocol
id: "task-3a2210a9"
name: "fix: isolate serial test runner lifetimes"
overview: "Stateful serial test files run with concurrency one and an independent node:test runner lifetime per file, while the concurrent batch behavior remains unchanged."
created: "2026-09-10T19:41:02.220Z"
todos:
  - id: "task-3a2210a9-c1"
    content: "Stateful serial test files run with concurrency one and an independent node:test runner lifetime per file, while the concurrent batch behavior remains unchanged."
    status: done
  - id: "task-3a2210a9-c2"
    content: "npm, Chalk verification, CI and release all use the bounded scheduler, and the declared Node engine covers the programmatic node:test API it requires."
    status: done
---

# fix: isolate serial test runner lifetimes

> state: **done** · phase: discovery

## Objective

- Stateful serial test files run with concurrency one and an independent node:test runner lifetime per file, while the concurrent batch behavior remains unchanged.
- npm, Chalk verification, CI and release all use the bounded scheduler, and the declared Node engine covers the programmatic node:test API it requires.

## Locked tests (read-only — P6)

- `test/serial-test-process-isolation.test.mjs`
- `test/verification-scheduling.test.mjs`

## Reviews

- **block** · 2026-09-10T23:31 · adversary
- **block** · 2026-09-11T00:12 · adversary
- **block** · 2026-09-11T00:24 · adversary
- **pass** · 2026-09-11T00:56 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
