---
generator: chalk-protocol
id: "task-f2c154c5"
name: "feat: post-run feedback nudge — after a productive `chalk run`, point the user at `chalk feedback --submit` (opt-out via CHALK_NO_NUDGE) (#155)"
overview: "feedbackNudge() returns a string pointing at 'chalk feedback --submit' after a productive run (merged>0 or blocked>0), and null on a no-op sweep (0/0) or when CHALK_NO_NUDGE is set"
created: "2026-07-12T15:09:44.802Z"
todos:
  - id: "task-f2c154c5-c1"
    content: "feedbackNudge() returns a string pointing at 'chalk feedback --submit' after a productive run (merged>0 or blocked>0), and null on a no-op sweep (0/0) or when CHALK_NO_NUDGE is set"
    status: done
  - id: "task-f2c154c5-c2"
    content: "chalk run wires feedbackNudge into its end-of-run summary (imported + called with the loop's merged/blocked totals)"
    status: done
---

# feat: post-run feedback nudge — after a productive `chalk run`, point the user at `chalk feedback --submit` (opt-out via CHALK_NO_NUDGE) (#155)

> state: **done** · phase: discovery

## Objective

- feedbackNudge() returns a string pointing at 'chalk feedback --submit' after a productive run (merged>0 or blocked>0), and null on a no-op sweep (0/0) or when CHALK_NO_NUDGE is set
- chalk run wires feedbackNudge into its end-of-run summary (imported + called with the loop's merged/blocked totals)

## Locked tests (read-only — P6)

- `test/feedback-nudge.test.mjs`

## Reviews

- **pass** · 2026-07-12T15:12 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
