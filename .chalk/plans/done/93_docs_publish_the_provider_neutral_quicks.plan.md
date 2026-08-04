---
generator: chalk-protocol
id: "task-9498ac31"
name: "docs: publish the provider-neutral quickstart, migration guide, and adapter-author guide"
overview: "The main quickstart uses `chalk init → chalk connect → chalk doctor → chalk run` as the autonomous happy path."
created: "2026-08-03T09:38:47.982Z"
todos:
  - id: "task-9498ac31-c1"
    content: "The main quickstart uses `chalk init → chalk connect → chalk doctor → chalk run` as the autonomous happy path."
    status: done
  - id: "task-9498ac31-c2"
    content: "Manual mode remains a first-class no-model path."
    status: done
  - id: "task-9498ac31-c3"
    content: "Provider-specific pages for Claude, OpenCode, Codex, and Gemini are generated from or checked against adapter manifests where practical."
    status: done
  - id: "task-9498ac31-c4"
    content: "A capability matrix states which roles and permission modes each adapter supports."
    status: done
  - id: "task-9498ac31-c5"
    content: "A migration guide covers every legacy `protocol.*.command` field and existing `--executor` setup."
    status: done
  - id: "task-9498ac31-c6"
    content: "Existing projects can remain on raw commands without an immediate forced migration."
    status: done
  - id: "task-9498ac31-c7"
    content: "The adapter-author guide documents Protocol v1, the conformance command, packaging, diagnostics, identity, usage, and security expectations."
    status: done
  - id: "task-9498ac31-c8"
    content: "Configuration examples contain no provider as the implied canonical default."
    status: done
  - id: "task-9498ac31-c9"
    content: "README, QUICKSTART, CONFIG, help text, and relative links pass drift/dead-link tests."
    status: done
  - id: "task-9498ac31-c10"
    content: "Release notes identify compatibility behavior and any deprecation timeline without removing legacy support."
    status: done
---

# docs: publish the provider-neutral quickstart, migration guide, and adapter-author guide

> state: **done** · phase: discovery

## Objective

- The main quickstart uses `chalk init → chalk connect → chalk doctor → chalk run` as the autonomous happy path.
- Manual mode remains a first-class no-model path.
- Provider-specific pages for Claude, OpenCode, Codex, and Gemini are generated from or checked against adapter manifests where practical.
- A capability matrix states which roles and permission modes each adapter supports.
- A migration guide covers every legacy `protocol.*.command` field and existing `--executor` setup.
- Existing projects can remain on raw commands without an immediate forced migration.
- The adapter-author guide documents Protocol v1, the conformance command, packaging, diagnostics, identity, usage, and security expectations.
- Configuration examples contain no provider as the implied canonical default.
- README, QUICKSTART, CONFIG, help text, and relative links pass drift/dead-link tests.
- Release notes identify compatibility behavior and any deprecation timeline without removing legacy support.

## Locked tests (read-only — P6)

- `test/provider-neutral-docs.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
