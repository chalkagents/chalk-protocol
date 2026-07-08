---
generator: chalk-protocol
id: "task-b118524b"
name: "feat: spine/protocol migration — stamp writer version, detect skew on open, gated chalk migrate (#159)"
overview: "Opening a spine stamped with a NEWER chalk-protocol version than the running binary is REFUSED (non-zero exit, a clear upgrade message) rather than silently misread — enforced in Store.open via spineSkew"
created: "2026-07-08T18:19:44.731Z"
todos:
  - id: "task-b118524b-c1"
    content: "Opening a spine stamped with a NEWER chalk-protocol version than the running binary is REFUSED (non-zero exit, a clear upgrade message) rather than silently misread — enforced in Store.open via spineSkew"
    status: done
  - id: "task-b118524b-c2"
    content: "chalk migrate carries an old-schema spine (pre-writerVersion, version 1.0) forward to the current schema, is IDEMPOTENT on re-run (no-op when already current), backs the spine up before mutating, and --dry-run mutates NOTHING"
    status: done
  - id: "task-b118524b-c3"
    content: "A same-version (compatible) spine opens with NO migration prompt and NO mutation of chalk.json; chalk doctor surfaces skew (fail for newer, warn for needs-migrate)"
    status: done
---

# feat: spine/protocol migration — stamp writer version, detect skew on open, gated chalk migrate (#159)

> state: **done** · phase: discovery

## Objective

- Opening a spine stamped with a NEWER chalk-protocol version than the running binary is REFUSED (non-zero exit, a clear upgrade message) rather than silently misread — enforced in Store.open via spineSkew
- chalk migrate carries an old-schema spine (pre-writerVersion, version 1.0) forward to the current schema, is IDEMPOTENT on re-run (no-op when already current), backs the spine up before mutating, and --dry-run mutates NOTHING
- A same-version (compatible) spine opens with NO migration prompt and NO mutation of chalk.json; chalk doctor surfaces skew (fail for newer, warn for needs-migrate)

## Locked tests (read-only — P6)

- `test/spine-migration.test.mjs`

## Reviews

- **pass** · 2026-07-08T18:24 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
