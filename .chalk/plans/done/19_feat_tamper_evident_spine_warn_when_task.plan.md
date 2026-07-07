---
generator: chalk-protocol
id: "task-30ee8dd7"
name: "feat: tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk"
overview: "protocol.tamperEvident (default false) opts in. When false/unset, chalk behaves exactly as before — no hashing, no warnings, no new writes on any command."
created: "2026-07-06T10:05:49.987Z"
todos:
  - id: "task-30ee8dd7-c1"
    content: "protocol.tamperEvident (default false) opts in. When false/unset, chalk behaves exactly as before — no hashing, no warnings, no new writes on any command."
    status: done
  - id: "task-30ee8dd7-c2"
    content: "When true, chalk records sha256 baselines of chalk.json + tasks.json in gitignored .chalk/local/ after every chalk write; a subsequent command whose on-disk hash differs from the baseline prints a loud warning naming the file and logs a tamper event."
    status: done
  - id: "task-30ee8dd7-c3"
    content: "It is evidence, not a lock: after warning it re-baselines so the notice fires exactly once; a first enabled run with no baseline establishes one without warning (fail-safe)."
    status: done
  - id: "task-30ee8dd7-c4"
    content: "Locked test proves: default-off is inert, chalk's own writes never false-positive, an outside edit to either file is caught (warning + event), the warning fires once, and the no-baseline case is fail-safe."
    status: done
---

# feat: tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk

> state: **done** · phase: discovery

## Objective

- protocol.tamperEvident (default false) opts in. When false/unset, chalk behaves exactly as before — no hashing, no warnings, no new writes on any command.
- When true, chalk records sha256 baselines of chalk.json + tasks.json in gitignored .chalk/local/ after every chalk write; a subsequent command whose on-disk hash differs from the baseline prints a loud warning naming the file and logs a tamper event.
- It is evidence, not a lock: after warning it re-baselines so the notice fires exactly once; a first enabled run with no baseline establishes one without warning (fail-safe).
- Locked test proves: default-off is inert, chalk's own writes never false-positive, an outside edit to either file is caught (warning + event), the warning fires once, and the no-baseline case is fail-safe.

## Locked tests (read-only — P6)

- `test/spine-tamper.test.mjs`

## Reviews

- **block** · 2026-07-07T08:50 · adversary
- **pass** · 2026-07-07T08:54 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
