---
generator: chalk-protocol
id: "task-971d7e8b"
name: "fix: expose structured reviewer failures and retry only transient errors"
overview: "Preserve structured timeout, invalid-output, permission and read-only-mutation diagnostics across reviewer failures. Retry only documented transient categories; record invocation duration and available usage without accepting invalid verdicts or weakening source integrity."
created: "2026-09-10T01:40:43.605Z"
todos:
  - id: "task-971d7e8b-c1"
    content: "Preserve structured timeout, invalid-output, permission and read-only-mutation diagnostics across reviewer failures. Retry only documented transient categories; record invocation duration and available usage without accepting invalid verdicts or weakening source integrity."
    status: pending
---

# fix: expose structured reviewer failures and retry only transient errors

> state: **blocked** · phase: discovery

## Objective

- Preserve structured timeout, invalid-output, permission and read-only-mutation diagnostics across reviewer failures. Retry only documented transient categories; record invocation duration and available usage without accepting invalid verdicts or weakening source integrity.

## Locked tests (read-only — P6)

- `test/reviewer-failures.test.mjs`
- `test/reviewer-retry-policy.test.mjs`
- `test/reviewer-pipeline-retry.test.mjs`
- `test/reviewer-verdict-integrity.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
