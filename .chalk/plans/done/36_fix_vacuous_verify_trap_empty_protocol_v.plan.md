---
generator: chalk-protocol
id: "task-3c3ede10"
name: "fix: vacuous verify trap — empty protocol.verify auto-passes P4; tighten chalk doctor to a blocker (#152)"
overview: "chalk doctor reports a blocking 'fail' when protocol.verify has NO configured gate AND there is a runnable task — even if that task HAS a locked test (an empty verify never runs it, so P4 passes vacuously). Softened to 'warn' when an adversarial reviewer gate is configured (the backstop)"
created: "2026-07-08T16:53:52.019Z"
todos:
  - id: "task-3c3ede10-c1"
    content: "chalk doctor reports a blocking 'fail' when protocol.verify has NO configured gate AND there is a runnable task — even if that task HAS a locked test (an empty verify never runs it, so P4 passes vacuously). Softened to 'warn' when an adversarial reviewer gate is configured (the backstop)"
    status: done
  - id: "task-3c3ede10-c2"
    content: "The empty-verify blocker makes chalk doctor exit non-zero and autopilot (which gates on doctor 'fail' findings) refuse — so an unattended run cannot silently complete tasks against a vacuous verify"
    status: done
  - id: "task-3c3ede10-c3"
    content: "A project WITH a configured protocol.verify gate produces no such finding (no false positive); the check is independent of the existing per-task testless check"
    status: done
---

# fix: vacuous verify trap — empty protocol.verify auto-passes P4; tighten chalk doctor to a blocker (#152)

> state: **done** · phase: discovery

## Objective

- chalk doctor reports a blocking 'fail' when protocol.verify has NO configured gate AND there is a runnable task — even if that task HAS a locked test (an empty verify never runs it, so P4 passes vacuously). Softened to 'warn' when an adversarial reviewer gate is configured (the backstop)
- The empty-verify blocker makes chalk doctor exit non-zero and autopilot (which gates on doctor 'fail' findings) refuse — so an unattended run cannot silently complete tasks against a vacuous verify
- A project WITH a configured protocol.verify gate produces no such finding (no false positive); the check is independent of the existing per-task testless check

## Locked tests (read-only — P6)

- `test/doctor-vacuous-verify.test.mjs`

## Reviews

- **pass** · 2026-07-08T17:05 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
