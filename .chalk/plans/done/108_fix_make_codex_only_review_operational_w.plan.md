---
generator: chalk-protocol
id: "task-38db08ca"
name: "fix: make Codex-only review operational with the installed CLI"
overview: "Codex adapter argv places approval settings where the installed CLI accepts them, keeps read-only versus workspace-write isolation and multiline stdin intact, and supplies a fully specified strict reviewer output schema."
created: "2026-09-08T08:40:02.431Z"
todos:
  - id: "task-38db08ca-c1"
    content: "Codex adapter argv places approval settings where the installed CLI accepts them, keeps read-only versus workspace-write isolation and multiline stdin intact, and supplies a fully specified strict reviewer output schema."
    status: done
  - id: "task-38db08ca-c2"
    content: "Connect executor/planner/reviewer to Codex with per-task review retained; remove legacy Claude commands, leave unsupported optional roles explicitly unconfigured and do not claim verified model independence."
    status: done
  - id: "task-38db08ca-c3"
    content: "Preserve offline adapter conformance and protocol contracts, add a regression fixture rejecting misplaced approval flags and malformed reviewer schema, and obtain a real structured Codex review through Chalk before completion."
    status: done
---

# fix: make Codex-only review operational with the installed CLI

> state: **done** · phase: discovery

## Objective

- Codex adapter argv places approval settings where the installed CLI accepts them, keeps read-only versus workspace-write isolation and multiline stdin intact, and supplies a fully specified strict reviewer output schema.
- Connect executor/planner/reviewer to Codex with per-task review retained; remove legacy Claude commands, leave unsupported optional roles explicitly unconfigured and do not claim verified model independence.
- Preserve offline adapter conformance and protocol contracts, add a regression fixture rejecting misplaced approval flags and malformed reviewer schema, and obtain a real structured Codex review through Chalk before completion.

## Locked tests (read-only — P6)

- `test/codex-cli-compat.test.mjs`

## Reviews

- **block** · 2026-09-08T08:52 · adversary
- **pass** · 2026-09-08T09:39 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
