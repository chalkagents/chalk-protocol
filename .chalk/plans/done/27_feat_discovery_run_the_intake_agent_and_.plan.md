---
generator: chalk-protocol
id: "task-e0c99196"
name: "feat: discovery — run the intake agent and normalize a proposed backlog"
overview: "lib/discovery.mjs exports runDiscovery(store, brief) and normalizeProposal(raw)"
created: "2026-06-28T22:04:35.135Z"
todos:
  - id: "task-e0c99196-c1"
    content: "lib/discovery.mjs exports runDiscovery(store, brief) and normalizeProposal(raw)"
    status: done
  - id: "task-e0c99196-c2"
    content: "runDiscovery runs protocol.discovery.command with the brief on stdin and tolerantly parses { tasks:[{title, criteria, milestone?, after?}], spec? }, returning { status, tasks, spec } (mirrors runRetro)"
    status: done
  - id: "task-e0c99196-c3"
    content: "normalizeProposal keeps only well-formed tasks (non-empty title AND at least one non-empty criterion), trims fields, and dedupes by title"
    status: done
  - id: "task-e0c99196-c4"
    content: "runDiscovery returns status 'unconfigured' when no command is set and 'error' when the agent emits no JSON"
    status: done
---

# feat: discovery — run the intake agent and normalize a proposed backlog

> state: **done** · phase: discovery

## Objective

- lib/discovery.mjs exports runDiscovery(store, brief) and normalizeProposal(raw)
- runDiscovery runs protocol.discovery.command with the brief on stdin and tolerantly parses { tasks:[{title, criteria, milestone?, after?}], spec? }, returning { status, tasks, spec } (mirrors runRetro)
- normalizeProposal keeps only well-formed tasks (non-empty title AND at least one non-empty criterion), trims fields, and dedupes by title
- runDiscovery returns status 'unconfigured' when no command is set and 'error' when the agent emits no JSON

## Locked tests (read-only — P6)

- `test/discovery.test.mjs`

## Reviews

- **pass** · 2026-06-28T22:08 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
