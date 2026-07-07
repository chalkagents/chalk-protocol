---
generator: chalk-protocol
id: "task-11ea6ea9"
name: "feat: give reviewer-induced auto-blocks a distinct `--needs` category instead of `human-input`"
overview: "Add a dedicated `--needs` value (e.g. `review`) to the taxonomy in CLAUDE.md and the block command validation."
created: "2026-07-06T10:05:49.989Z"
todos:
  - id: "task-11ea6ea9-c1"
    content: "Add a dedicated `--needs` value (e.g. `review`) to the taxonomy in CLAUDE.md and the block command validation."
    status: done
  - id: "task-11ea6ea9-c2"
    content: "Emit reviewer-induced blocks in lib/pipeline.mjs with the new category instead of `human-input`."
    status: done
  - id: "task-11ea6ea9-c3"
    content: "`chalk status` / next surface the review block distinctly so it is not confused with a real human dependency."
    status: done
  - id: "task-11ea6ea9-c4"
    content: "Add a test asserting a reviewer block sets the review-specific `needs` while a genuine stage failure stays `human-input`."
    status: done
---

# feat: give reviewer-induced auto-blocks a distinct `--needs` category instead of `human-input`

> state: **done** · phase: discovery

## Objective

- Add a dedicated `--needs` value (e.g. `review`) to the taxonomy in CLAUDE.md and the block command validation.
- Emit reviewer-induced blocks in lib/pipeline.mjs with the new category instead of `human-input`.
- `chalk status` / next surface the review block distinctly so it is not confused with a real human dependency.
- Add a test asserting a reviewer block sets the review-specific `needs` while a genuine stage failure stays `human-input`.

## Locked tests (read-only — P6)

- `test/review-block-needs.test.mjs`

## Reviews

- **block** · 2026-07-06T12:31 · adversary
- **pass** · 2026-07-06T12:35 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
