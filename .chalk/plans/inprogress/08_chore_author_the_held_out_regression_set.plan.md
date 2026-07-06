---
generator: chalk-protocol
id: "task-2cae7c80"
name: "chore: author the held-out regression set — audit warns 0 tests vs a floor of 4 (~10k LOC)"
overview: "regression.command and regression.authorCommand are configured (node --test .chalk/held-out + a BYO claude author); .chalk/held-out stays gitignored"
created: "2026-07-06T08:12:17.234Z"
todos:
  - id: "task-2cae7c80-c1"
    content: "regression.command and regression.authorCommand are configured (node --test .chalk/held-out + a BYO claude author); .chalk/held-out stays gitignored"
    status: pending
  - id: "task-2cae7c80-c2"
    content: "chalk guard gen authors at least 4 held-out test files derived from the spec (the size floor for ~10k LOC), locked into regression.tests"
    status: pending
  - id: "task-2cae7c80-c3"
    content: "chalk audit runs GREEN with the understaffing warning gone"
    status: pending
  - id: "task-2cae7c80-c4"
    content: "implementer blindness holds: the tests are written by the BYO guard author subprocess; this session never reads .chalk/held-out contents"
    status: pending
---

# chore: author the held-out regression set — audit warns 0 tests vs a floor of 4 (~10k LOC)

> state: **blocked** · phase: discovery

## Objective

- regression.command and regression.authorCommand are configured (node --test .chalk/held-out + a BYO claude author); .chalk/held-out stays gitignored
- chalk guard gen authors at least 4 held-out test files derived from the spec (the size floor for ~10k LOC), locked into regression.tests
- chalk audit runs GREEN with the understaffing warning gone
- implementer blindness holds: the tests are written by the BYO guard author subprocess; this session never reads .chalk/held-out contents

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
