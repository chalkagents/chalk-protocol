---
generator: chalk-protocol
id: "task-a9a11c5c"
name: "feat: size-scaled P7 stringency — held-out set floor grows with code size (SpecBench)"
overview: "heldOutFloor(loc, locPerTest) returns a minimum held-out count that scales with code size (floor = loc/locPerTest, default 2000, safe on non-positive)"
created: "2026-07-01T01:07:00.654Z"
todos:
  - id: "task-a9a11c5c-c1"
    content: "heldOutFloor(loc, locPerTest) returns a minimum held-out count that scales with code size (floor = loc/locPerTest, default 2000, safe on non-positive)"
    status: done
  - id: "task-a9a11c5c-c2"
    content: "chalk audit warns (stays green) and the phase P7 gate refuses (overridable via --force-audit --why) when the held-out set is below the size floor"
    status: done
---

# feat: size-scaled P7 stringency — held-out set floor grows with code size (SpecBench)

> state: **done** · phase: discovery

## Objective

- heldOutFloor(loc, locPerTest) returns a minimum held-out count that scales with code size (floor = loc/locPerTest, default 2000, safe on non-positive)
- chalk audit warns (stays green) and the phase P7 gate refuses (overridable via --force-audit --why) when the held-out set is below the size floor

## Locked tests (read-only — P6)

- `test/heldout-scaling.test.mjs`

## Reviews

- **pass** · 2026-07-01T01:09 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
