---
generator: chalk-protocol
id: "task-615d7e74"
name: "feat: chalk log --grep <text>"
overview: "`chalk log --grep <text>` shows only update events whose title contains <text> (case-insensitive), still honoring `--n`, `--type`, and `--reverse`"
created: "2026-06-25T13:06:23.683Z"
todos:
  - id: "task-615d7e74-c1"
    content: "`chalk log --grep <text>` shows only update events whose title contains <text> (case-insensitive), still honoring `--n`, `--type`, and `--reverse`"
    status: done
  - id: "task-615d7e74-c2"
    content: "without `--grep`, output is unchanged"
    status: done
  - id: "task-615d7e74-c3"
    content: "add a test in `test/protocol.test.mjs` asserting `--grep` filters AND that it composes with another flag (e.g. `--type`)"
    status: done
---

# feat: chalk log --grep <text>

> state: **done** · phase: discovery

## Objective

- `chalk log --grep <text>` shows only update events whose title contains <text> (case-insensitive), still honoring `--n`, `--type`, and `--reverse`
- without `--grep`, output is unchanged
- add a test in `test/protocol.test.mjs` asserting `--grep` filters AND that it composes with another flag (e.g. `--type`)

## Reviews

- **pass** · 2026-06-25T13:16 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
