---
generator: chalk-protocol
id: "task-11b3c047"
name: "fix: CONFIG.md drift gate only validates top-level protocol keys"
overview: "Recurse into nested protocol.* keys (dotted paths) when comparing documented vs initialized config"
created: "2026-07-06T06:46:13.554Z"
todos:
  - id: "task-11b3c047-c1"
    content: "Recurse into nested protocol.* keys (dotted paths) when comparing documented vs initialized config"
    status: done
  - id: "task-11b3c047-c2"
    content: "Add a test asserting a documented-but-removed nested key (and an undocumented new nested key) fails the gate"
    status: done
---

# fix: CONFIG.md drift gate only validates top-level protocol keys

> state: **done** · phase: discovery

## Objective

- Recurse into nested protocol.* keys (dotted paths) when comparing documented vs initialized config
- Add a test asserting a documented-but-removed nested key (and an undocumented new nested key) fails the gate

## Locked tests (read-only — P6)

- `test/docs.test.mjs`
- `test/config-drift.test.mjs`

## Reviews

- **pass** · 2026-07-06T07:06 · adversary
- **stale** · 2026-07-06T07:07 · amend-spec
- **pass** · 2026-07-06T07:09 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
