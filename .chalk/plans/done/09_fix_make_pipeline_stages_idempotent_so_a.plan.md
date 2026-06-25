---
generator: chalk-protocol
id: "task-c1884dfd"
name: "fix: make pipeline stages idempotent so an interrupted sweep resumes cleanly"
overview: "A hermetic test that runs the pipeline to a partial point, then re-runs and asserts it resumes — **no duplicate branch, no duplicate commit** — and the task still reaches `done` (compose the assertion across stages, per the recorded lesson; don't test one stage in isolation)."
created: "2026-06-25T21:37:32.413Z"
todos:
  - id: "task-c1884dfd-c1"
    content: "A hermetic test that runs the pipeline to a partial point, then re-runs and asserts it resumes — **no duplicate branch, no duplicate commit** — and the task still reaches `done` (compose the assertion across stages, per the recorded lesson; don't test one stage in isolation)."
    status: done
  - id: "task-c1884dfd-c2"
    content: "Existing 53 tests stay green; the locked suite is untouched."
    status: done
  - id: "task-c1884dfd-c3"
    content: "No change to the happy-path ORDER; only the per-stage 'already done?' guards."
    status: done
---

# fix: make pipeline stages idempotent so an interrupted sweep resumes cleanly

> state: **done** · phase: discovery

## Objective

- A hermetic test that runs the pipeline to a partial point, then re-runs and asserts it resumes — **no duplicate branch, no duplicate commit** — and the task still reaches `done` (compose the assertion across stages, per the recorded lesson; don't test one stage in isolation).
- Existing 53 tests stay green; the locked suite is untouched.
- No change to the happy-path ORDER; only the per-stage 'already done?' guards.

## Reviews

- **block** · 2026-06-25T21:44 · adversary
- **pass** · 2026-06-25T21:49 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
