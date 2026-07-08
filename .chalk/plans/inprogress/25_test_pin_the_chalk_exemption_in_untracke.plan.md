---
generator: chalk-protocol
id: "task-fb7b9744"
name: "test: pin the `.chalk/` exemption in untrackedLockedTests — the tracking gate's carve-out is unasserted in either direction"
overview: "A locked test asserts a `.chalk/`-pinned path is NOT reported untracked (the intentional exemption)"
created: "2026-07-07T09:50:24.964Z"
todos:
  - id: "task-fb7b9744-c1"
    content: "A locked test asserts a `.chalk/`-pinned path is NOT reported untracked (the intentional exemption)"
    status: pending
  - id: "task-fb7b9744-c2"
    content: "A locked test asserts a non-`.chalk/` untracked pin IS still reported alongside an exempted one (multi-path rendering)"
    status: pending
  - id: "task-fb7b9744-c3"
    content: "The exemption's scope is documented in CONFIG.md or the gate's error text so spec authors know `.chalk/` pins bypass the tracking check"
    status: pending
---

# test: pin the `.chalk/` exemption in untrackedLockedTests — the tracking gate's carve-out is unasserted in either direction

> state: **blocked** · phase: discovery

## Objective

- A locked test asserts a `.chalk/`-pinned path is NOT reported untracked (the intentional exemption)
- A locked test asserts a non-`.chalk/` untracked pin IS still reported alongside an exempted one (multi-path rendering)
- The exemption's scope is documented in CONFIG.md or the gate's error text so spec authors know `.chalk/` pins bypass the tracking check

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
