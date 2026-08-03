---
generator: chalk-protocol
id: "task-03b0db1c"
name: "feat: add provider-neutral agent profiles, role bindings, and explicit identity"
overview: "Configuration supports named profiles and a role-to-profile map."
created: "2026-08-03T07:23:30.051Z"
todos:
  - id: "task-03b0db1c-c1"
    content: "Configuration supports named profiles and a role-to-profile map."
    status: pending
  - id: "task-03b0db1c-c2"
    content: "One profile can serve multiple roles without duplicating its connection details."
    status: pending
  - id: "task-03b0db1c-c3"
    content: "Model values are opaque strings and never drive provider branches in Chalk core."
    status: pending
  - id: "task-03b0db1c-c4"
    content: "Reviewer independence compares explicit normalized identity or reports that independence is unverified."
    status: pending
  - id: "task-03b0db1c-c5"
    content: "Existing `protocol.*.command` values normalize into compatibility profiles without changing behavior."
    status: pending
  - id: "task-03b0db1c-c6"
    content: "A migration path is versioned, idempotent, and preserves user-edited commands."
    status: pending
  - id: "task-03b0db1c-c7"
    content: "Config drift tests and `docs/CONFIG.md` cover every new field."
    status: pending
  - id: "task-03b0db1c-c8"
    content: "`chalk doctor --json` reports resolved role bindings and identity without exposing credentials."
    status: pending
  - id: "task-03b0db1c-c9"
    content: "Tests cover shared profiles, distinct reviewer identity, unknown identity, and legacy configuration."
    status: pending
---

# feat: add provider-neutral agent profiles, role bindings, and explicit identity

> state: **in-progress** · phase: discovery

## Objective

- Configuration supports named profiles and a role-to-profile map.
- One profile can serve multiple roles without duplicating its connection details.
- Model values are opaque strings and never drive provider branches in Chalk core.
- Reviewer independence compares explicit normalized identity or reports that independence is unverified.
- Existing `protocol.*.command` values normalize into compatibility profiles without changing behavior.
- A migration path is versioned, idempotent, and preserves user-edited commands.
- Config drift tests and `docs/CONFIG.md` cover every new field.
- `chalk doctor --json` reports resolved role bindings and identity without exposing credentials.
- Tests cover shared profiles, distinct reviewer identity, unknown identity, and legacy configuration.

## Locked tests (read-only — P6)

- `test/agent-profiles.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
