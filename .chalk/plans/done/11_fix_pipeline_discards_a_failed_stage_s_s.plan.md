---
generator: chalk-protocol
id: "task-7799438c"
name: "fix: pipeline discards a failed stage's stdout/stderr, leaving auto-blocks undiagnosable"
overview: "On a non-zero stage exit, include a trimmed snippet of the failed stage's stderr/stdout in the block reason instead of only `pipeline stage '<cmd>' failed`."
created: "2026-06-25T22:59:12.336Z"
todos:
  - id: "task-7799438c-c1"
    content: "On a non-zero stage exit, include a trimmed snippet of the failed stage's stderr/stdout in the block reason instead of only `pipeline stage '<cmd>' failed`."
    status: done
  - id: "task-7799438c-c2"
    content: "Log the failed stage's captured output (or a bounded tail) so it appears in the sweep transcript, not just the exit code."
    status: done
  - id: "task-7799438c-c3"
    content: "Add a test asserting that when a stage subprocess fails, the resulting block reason/log carries the subprocess's error output."
    status: done
---

# fix: pipeline discards a failed stage's stdout/stderr, leaving auto-blocks undiagnosable

> state: **done** · phase: discovery

## Objective

- On a non-zero stage exit, include a trimmed snippet of the failed stage's stderr/stdout in the block reason instead of only `pipeline stage '<cmd>' failed`.
- Log the failed stage's captured output (or a bounded tail) so it appears in the sweep transcript, not just the exit code.
- Add a test asserting that when a stage subprocess fails, the resulting block reason/log carries the subprocess's error output.

## Reviews

- **pass** · 2026-06-25T23:03 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
