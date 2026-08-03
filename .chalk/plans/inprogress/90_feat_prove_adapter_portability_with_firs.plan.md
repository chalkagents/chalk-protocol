---
generator: chalk-protocol
id: "task-0bf964ba"
name: "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"
overview: "Codex and Gemini adapters pass the same offline conformance suite as Claude and OpenCode."
created: "2026-08-03T08:44:45.525Z"
todos:
  - id: "task-0bf964ba-c1"
    content: "Codex and Gemini adapters pass the same offline conformance suite as Claude and OpenCode."
    status: pending
  - id: "task-0bf964ba-c2"
    content: "Each adapter supports executor, planner, and reviewer roles where the underlying CLI exposes the required access/output capabilities."
    status: pending
  - id: "task-0bf964ba-c3"
    content: "Unsupported roles or capabilities are reported explicitly during readiness checks."
    status: pending
  - id: "task-0bf964ba-c4"
    content: "Authentication remains owned by the installed provider CLI; Chalk stores no provider credentials."
    status: pending
  - id: "task-0bf964ba-c5"
    content: "Model selection is optional opaque adapter configuration."
    status: pending
  - id: "task-0bf964ba-c6"
    content: "Prompt transport preserves multiline context verbatim without shell interpolation."
    status: pending
  - id: "task-0bf964ba-c7"
    content: "Structured reviewer output is normalized through the common role contract."
    status: pending
  - id: "task-0bf964ba-c8"
    content: "Usage and identity are normalized when exposed by the CLI and degrade honestly when unavailable."
    status: pending
  - id: "task-0bf964ba-c9"
    content: "Adding both adapters requires no provider-name branch in Chalk workflow modules."
    status: pending
  - id: "task-0bf964ba-c10"
    content: "Package and documentation tests prove shipped adapter assets are available after npm installation."
    status: pending
---

# feat: prove adapter portability with first-party Codex and Gemini CLI adapters

> state: **in-progress** · phase: discovery

## Objective

- Codex and Gemini adapters pass the same offline conformance suite as Claude and OpenCode.
- Each adapter supports executor, planner, and reviewer roles where the underlying CLI exposes the required access/output capabilities.
- Unsupported roles or capabilities are reported explicitly during readiness checks.
- Authentication remains owned by the installed provider CLI; Chalk stores no provider credentials.
- Model selection is optional opaque adapter configuration.
- Prompt transport preserves multiline context verbatim without shell interpolation.
- Structured reviewer output is normalized through the common role contract.
- Usage and identity are normalized when exposed by the CLI and degrade honestly when unavailable.
- Adding both adapters requires no provider-name branch in Chalk workflow modules.
- Package and documentation tests prove shipped adapter assets are available after npm installation.

## Locked tests (read-only — P6)

- `test/codex-gemini-adapters.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
