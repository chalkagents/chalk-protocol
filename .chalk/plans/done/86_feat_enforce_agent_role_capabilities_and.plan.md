---
generator: chalk-protocol
id: "task-2c947642"
name: "feat: enforce agent role capabilities and structured-output contracts"
overview: "Every canonical role declares `read-only` or `workspace-write` access and text or structured output."
created: "2026-08-03T07:38:25.823Z"
todos:
  - id: "task-2c947642-c1"
    content: "Every canonical role declares `read-only` or `workspace-write` access and text or structured output."
    status: done
  - id: "task-2c947642-c2"
    content: "Adapters report which requested capabilities they can enforce."
    status: done
  - id: "task-2c947642-c3"
    content: "Unsupported required capabilities fail readiness checks honestly rather than silently degrading."
    status: done
  - id: "task-2c947642-c4"
    content: "Chalk detects worktree changes made by a read-only role and refuses to accept that role result."
    status: done
  - id: "task-2c947642-c5"
    content: "The refusal identifies changed paths without automatically deleting user data."
    status: done
  - id: "task-2c947642-c6"
    content: "Structured roles validate their normalized payload against one role-specific contract after adapter decoding."
    status: done
  - id: "task-2c947642-c7"
    content: "Malformed, truncated, or schema-invalid output yields consistent diagnostics across providers."
    status: done
  - id: "task-2c947642-c8"
    content: "Tests use malicious and incapable fake adapters to cover mutation and capability failures."
    status: done
  - id: "task-2c947642-c9"
    content: "Executor write access remains unaffected."
    status: done
---

# feat: enforce agent role capabilities and structured-output contracts

> state: **done** · phase: discovery

## Objective

- Every canonical role declares `read-only` or `workspace-write` access and text or structured output.
- Adapters report which requested capabilities they can enforce.
- Unsupported required capabilities fail readiness checks honestly rather than silently degrading.
- Chalk detects worktree changes made by a read-only role and refuses to accept that role result.
- The refusal identifies changed paths without automatically deleting user data.
- Structured roles validate their normalized payload against one role-specific contract after adapter decoding.
- Malformed, truncated, or schema-invalid output yields consistent diagnostics across providers.
- Tests use malicious and incapable fake adapters to cover mutation and capability failures.
- Executor write access remains unaffected.

## Locked tests (read-only — P6)

- `test/agent-capabilities.test.mjs`
- `test/review-retry.test.mjs`
- `test/review-no-diff.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
