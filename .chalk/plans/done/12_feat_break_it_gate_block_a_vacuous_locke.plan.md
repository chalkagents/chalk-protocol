---
generator: chalk-protocol
id: "task-00ae9415"
name: "feat: break-it gate — block a vacuous locked test (lever 3)"
overview: "lib/breakit.mjs exports runBreakit(store, task) and a pure evaluateBreakit({tests, runsGreenOnBase}) helper"
created: "2026-06-28T11:51:46.161Z"
todos:
  - id: "task-00ae9415-c1"
    content: "lib/breakit.mjs exports runBreakit(store, task) and a pure evaluateBreakit({tests, runsGreenOnBase}) helper"
    status: done
  - id: "task-00ae9415-c2"
    content: "When protocol.breakTest is empty/unset, the gate is OFF (skipped) — opt-in like e2e/regression"
    status: done
  - id: "task-00ae9415-c3"
    content: "A locked CODE test that still PASSES against the reverted (pre-change) implementation is flagged vacuous"
    status: done
  - id: "task-00ae9415-c4"
    content: "A locked test that FAILS against reverted code (because it asserts the change) is NOT flagged"
    status: done
  - id: "task-00ae9415-c5"
    content: "runBreakit restores the working tree (impl changes intact) after the check, even on failure"
    status: done
  - id: "task-00ae9415-c6"
    content: "wired into chalk work and runDriver AFTER the lever-1 testgate; a vacuous locked test blocks (exit 2 / needs:human-input)"
    status: done
  - id: "task-00ae9415-c7"
    content: "protocol.breakTest default is '' in store.mjs init defaults"
    status: done
---

# feat: break-it gate — block a vacuous locked test (lever 3)

> state: **done** · phase: discovery

## Objective

- lib/breakit.mjs exports runBreakit(store, task) and a pure evaluateBreakit({tests, runsGreenOnBase}) helper
- When protocol.breakTest is empty/unset, the gate is OFF (skipped) — opt-in like e2e/regression
- A locked CODE test that still PASSES against the reverted (pre-change) implementation is flagged vacuous
- A locked test that FAILS against reverted code (because it asserts the change) is NOT flagged
- runBreakit restores the working tree (impl changes intact) after the check, even on failure
- wired into chalk work and runDriver AFTER the lever-1 testgate; a vacuous locked test blocks (exit 2 / needs:human-input)
- protocol.breakTest default is '' in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/breakit.test.mjs`

## Reviews

- **block** · 2026-06-28T11:58 · adversary
- **pass** · 2026-06-28T12:06 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
