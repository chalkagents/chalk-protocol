---
generator: chalk-protocol
id: "task-2a7025bb"
name: "feat: doctor for strangers — per-OS gh install hints, optional-executor framing, --json output, unused-gates nudge"
overview: "missing gh/git produce per-OS copy-paste install hints (installHint exported+pure); gh is scoped 'needed for the issue/PR pipeline, NOT for the local loop'"
created: "2026-07-02T05:01:01.510Z"
todos:
  - id: "task-2a7025bb-c1"
    content: "missing gh/git produce per-OS copy-paste install hints (installHint exported+pure); gh is scoped 'needed for the issue/PR pipeline, NOT for the local loop'"
    status: done
  - id: "task-2a7025bb-c2"
    content: "no-executor stays a FAIL (autopilot gates on it) but is framed OPTIONAL for the manual loop with the loop spelled out"
    status: done
  - id: "task-2a7025bb-c3"
    content: "an info-level nudge names exactly the opt-in levers that are OFF (breakTest, mutation, held-out, review, plan-approval); armed levers drop out"
    status: done
  - id: "task-2a7025bb-c4"
    content: "chalk doctor --json emits {at,node,platform,results} for bug reports with the exit code preserved"
    status: done
  - id: "task-2a7025bb-c5"
    content: "a NOT READY verdict prints that it concerns UNATTENDED runs and offers the manual loop"
    status: done
---

# feat: doctor for strangers — per-OS gh install hints, optional-executor framing, --json output, unused-gates nudge

> state: **done** · phase: discovery

## Objective

- missing gh/git produce per-OS copy-paste install hints (installHint exported+pure); gh is scoped 'needed for the issue/PR pipeline, NOT for the local loop'
- no-executor stays a FAIL (autopilot gates on it) but is framed OPTIONAL for the manual loop with the loop spelled out
- an info-level nudge names exactly the opt-in levers that are OFF (breakTest, mutation, held-out, review, plan-approval); armed levers drop out
- chalk doctor --json emits {at,node,platform,results} for bug reports with the exit code preserved
- a NOT READY verdict prints that it concerns UNATTENDED runs and offers the manual loop

## Locked tests (read-only — P6)

- `test/doctor.test.mjs`

## Reviews

- **block** · 2026-07-02T06:10 · adversary
- **pass** · 2026-07-02T06:13 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
