---
generator: chalk-protocol
id: "task-f781d728"
name: "fix: untrackedLockedTests exempts every .chalk/ pinned path — an e2e spec locked under .chalk/tests/ escapes the tracking gate"
overview: "Narrow the exemption to spine-state files that genuinely land out-of-band, so pinned e2e specs under `.chalk/tests/` are still tracking-gated."
created: "2026-07-07T09:50:24.955Z"
todos:
  - id: "task-f781d728-c1"
    content: "Narrow the exemption to spine-state files that genuinely land out-of-band, so pinned e2e specs under `.chalk/tests/` are still tracking-gated."
    status: done
  - id: "task-f781d728-c2"
    content: "Locked test asserts the carve-out in BOTH directions: a spine-state pin is exempt, and a `.chalk/tests/*.test.yaml` pin is required to be tracked in git."
    status: done
  - id: "task-f781d728-c3"
    content: "untrackedLockedTests narrows the .chalk/ exemption: e2e specs pinned under .chalk/tests/ ARE tracking-gated (must be git-tracked), while genuine out-of-band spine-state paths under .chalk/ stay exempt."
    status: done
  - id: "task-f781d728-c4"
    content: "chalk commit stages pinned .chalk/tests/ specs (in addition to code and .chalk/evidence/), so the pipeline tracks e2e contract specs — closing the gap where the narrowed gate would otherwise block on a spec the commit stage never staged."
    status: done
  - id: "task-f781d728-c5"
    content: "Locked test asserts the carve-out in BOTH directions: an untracked .chalk/tests/*.test.yaml pin blocks chalk done (and passes once tracked), and an untracked non-tests .chalk/ spine-state pin is exempt."
    status: done
---

# fix: untrackedLockedTests exempts every .chalk/ pinned path — an e2e spec locked under .chalk/tests/ escapes the tracking gate

> state: **done** · phase: discovery

## Objective

- Narrow the exemption to spine-state files that genuinely land out-of-band, so pinned e2e specs under `.chalk/tests/` are still tracking-gated.
- Locked test asserts the carve-out in BOTH directions: a spine-state pin is exempt, and a `.chalk/tests/*.test.yaml` pin is required to be tracked in git.
- untrackedLockedTests narrows the .chalk/ exemption: e2e specs pinned under .chalk/tests/ ARE tracking-gated (must be git-tracked), while genuine out-of-band spine-state paths under .chalk/ stay exempt.
- chalk commit stages pinned .chalk/tests/ specs (in addition to code and .chalk/evidence/), so the pipeline tracks e2e contract specs — closing the gap where the narrowed gate would otherwise block on a spec the commit stage never staged.
- Locked test asserts the carve-out in BOTH directions: an untracked .chalk/tests/*.test.yaml pin blocks chalk done (and passes once tracked), and an untracked non-tests .chalk/ spine-state pin is exempt.

## Locked tests (read-only — P6)

- `test/chalk-tests-tracking.test.mjs`

## Reviews

- **pass** · 2026-07-07T09:59 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
