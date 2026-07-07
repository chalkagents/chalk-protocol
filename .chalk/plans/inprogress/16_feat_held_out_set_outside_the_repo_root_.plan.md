---
generator: chalk-protocol
id: "task-4bcc8640"
name: "feat: held-out set outside the repo root (manual-mode blindness)"
overview: "protocol.regression.dir accepts an absolute or ~-prefixed path OUTSIDE the repo (not just a repo-relative dir); a new heldOutBase resolver handles all three forms, empty/unset keeps the historical .chalk/held-out."
created: "2026-07-06T10:05:49.984Z"
todos:
  - id: "task-4bcc8640-c1"
    content: "protocol.regression.dir accepts an absolute or ~-prefixed path OUTSIDE the repo (not just a repo-relative dir); a new heldOutBase resolver handles all three forms, empty/unset keeps the historical .chalk/held-out."
    status: pending
  - id: "task-4bcc8640-c2"
    content: "Locking and integrity work across the repo boundary: an inside-repo held-out file is stored repo-relative (portable), an outside file is stored by absolute path, and brokenHeldOut/audit detect a tamper of either."
    status: pending
  - id: "task-4bcc8640-c3"
    content: "guard listing/locking and chalk audit run end-to-end against an outside dir: guard add locks an outside file, audit is GREEN while intact and RED when the outside file is tampered."
    status: pending
  - id: "task-4bcc8640-c4"
    content: "chalk doctor recommends relocating the held-out set outside the repo when worktree isolation is off and the set is in-repo (manual-mode blindness), and stays quiet once the dir is already outside."
    status: pending
  - id: "task-4bcc8640-c5"
    content: "Locked test proves the resolver (relative/absolute/~), inside-vs-outside lock storage + round-trip, listing an absolute dir, the end-to-end guard→audit flow, and the doctor recommendation in both directions."
    status: pending
---

# feat: held-out set outside the repo root (manual-mode blindness)

> state: **in-progress** · phase: discovery

## Objective

- protocol.regression.dir accepts an absolute or ~-prefixed path OUTSIDE the repo (not just a repo-relative dir); a new heldOutBase resolver handles all three forms, empty/unset keeps the historical .chalk/held-out.
- Locking and integrity work across the repo boundary: an inside-repo held-out file is stored repo-relative (portable), an outside file is stored by absolute path, and brokenHeldOut/audit detect a tamper of either.
- guard listing/locking and chalk audit run end-to-end against an outside dir: guard add locks an outside file, audit is GREEN while intact and RED when the outside file is tampered.
- chalk doctor recommends relocating the held-out set outside the repo when worktree isolation is off and the set is in-repo (manual-mode blindness), and stays quiet once the dir is already outside.
- Locked test proves the resolver (relative/absolute/~), inside-vs-outside lock storage + round-trip, listing an absolute dir, the end-to-end guard→audit flow, and the doctor recommendation in both directions.

## Locked tests (read-only — P6)

- `test/held-out-outside-root.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
