---
generator: chalk-protocol
id: "task-60394447"
name: "docs: document the promote CI-poll knobs (ciPollIntervalMs/ciPollAttempts) in CONFIG + a runtime hint (#153)"
overview: "docs/CONFIG.md's github section DESCRIBES ciPollIntervalMs and ciPollAttempts — what they control (remote-CI polling cadence during merge/promote) and the ciPollAttempts:0 never-wait escape — not merely lists them; the docs/CONFIG.md ↔ initSpine drift gate stays green"
created: "2026-07-09T07:47:23.047Z"
todos:
  - id: "task-60394447-c1"
    content: "docs/CONFIG.md's github section DESCRIBES ciPollIntervalMs and ciPollAttempts — what they control (remote-CI polling cadence during merge/promote) and the ciPollAttempts:0 never-wait escape — not merely lists them; the docs/CONFIG.md ↔ initSpine drift gate stays green"
    status: done
  - id: "task-60394447-c2"
    content: "The release --promote CI-poll timeout (still-pending) message points the user at github.ciPollAttempts / ciPollIntervalMs"
    status: done
---

# docs: document the promote CI-poll knobs (ciPollIntervalMs/ciPollAttempts) in CONFIG + a runtime hint (#153)

> state: **done** · phase: discovery

## Objective

- docs/CONFIG.md's github section DESCRIBES ciPollIntervalMs and ciPollAttempts — what they control (remote-CI polling cadence during merge/promote) and the ciPollAttempts:0 never-wait escape — not merely lists them; the docs/CONFIG.md ↔ initSpine drift gate stays green
- The release --promote CI-poll timeout (still-pending) message points the user at github.ciPollAttempts / ciPollIntervalMs

## Locked tests (read-only — P6)

- `test/config-cipoll-docs.test.mjs`

## Reviews

- **block** · 2026-07-09T07:50 · adversary
- **pass** · 2026-07-09T07:53 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
