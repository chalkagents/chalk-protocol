---
generator: chalk-protocol
id: "task-d9660b4e"
name: "feat: mutation-testing adequacy gate — block a change whose changed code has surviving mutants (lever 3, rigorous)"
overview: "evaluateMutation returns exactly the changed files whose mutants are not all killed (surviving mutants = weak tests)"
created: "2026-06-30T14:21:09.758Z"
todos:
  - id: "task-d9660b4e-c1"
    content: "evaluateMutation returns exactly the changed files whose mutants are not all killed (surviving mutants = weak tests)"
    status: done
  - id: "task-d9660b4e-c2"
    content: "runMutation is opt-in (protocol.mutation), mutates only changed implementation files, and flags survivors by the command's non-zero exit; skips when unconfigured or no impl change"
    status: done
---

# feat: mutation-testing adequacy gate — block a change whose changed code has surviving mutants (lever 3, rigorous)

> state: **done** · phase: discovery

## Objective

- evaluateMutation returns exactly the changed files whose mutants are not all killed (surviving mutants = weak tests)
- runMutation is opt-in (protocol.mutation), mutates only changed implementation files, and flags survivors by the command's non-zero exit; skips when unconfigured or no impl change

## Locked tests (read-only — P6)

- `test/mutation.test.mjs`

## Reviews

- **block** · 2026-06-30T14:25 · adversary
- **pass** · 2026-06-30T14:30 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
