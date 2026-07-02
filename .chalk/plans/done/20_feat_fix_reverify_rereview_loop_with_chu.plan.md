---
generator: chalk-protocol
id: "task-133872dc"
name: "feat: fix-reverify-rereview loop with churn budget and handoff"
overview: "buildContext includes the latest blocking review's findings (an 'Address these review findings' section) so a re-run executor knows what to fix"
created: "2026-06-28T17:14:58.695Z"
todos:
  - id: "task-133872dc-c1"
    content: "buildContext includes the latest blocking review's findings (an 'Address these review findings' section) so a re-run executor knows what to fix"
    status: done
  - id: "task-133872dc-c2"
    content: "lib/reviewloop.mjs exports reviewFixLoop({store, ref, call, cliPath, maxRounds}) that rewinds the task's pipeline stage and re-runs work then commit then review up to maxRounds, returning {passed, rounds}"
    status: done
  - id: "task-133872dc-c3"
    content: "reviewFixLoop returns passed:true as soon as a re-review exits 0; passed:false when work fails or the rounds are exhausted"
    status: done
  - id: "task-133872dc-c4"
    content: "the pipeline, on a genuine review BLOCK (exit 3), runs reviewFixLoop; on pass it proceeds, on exhaustion it writes a handoff and blocks needs:human-input with the findings"
    status: done
  - id: "task-133872dc-c5"
    content: "transient reviewer errors (nonzero exit that is not a block) keep the existing retry-once behavior"
    status: done
---

# feat: fix-reverify-rereview loop with churn budget and handoff

> state: **done** · phase: discovery

## Objective

- buildContext includes the latest blocking review's findings (an 'Address these review findings' section) so a re-run executor knows what to fix
- lib/reviewloop.mjs exports reviewFixLoop({store, ref, call, cliPath, maxRounds}) that rewinds the task's pipeline stage and re-runs work then commit then review up to maxRounds, returning {passed, rounds}
- reviewFixLoop returns passed:true as soon as a re-review exits 0; passed:false when work fails or the rounds are exhausted
- the pipeline, on a genuine review BLOCK (exit 3), runs reviewFixLoop; on pass it proceeds, on exhaustion it writes a handoff and blocks needs:human-input with the findings
- transient reviewer errors (nonzero exit that is not a block) keep the existing retry-once behavior

## Locked tests (read-only — P6)

- `test/reviewloop.test.mjs`

## Reviews

- **block** · 2026-06-28T18:05 · adversary
- **pass** · 2026-06-28T18:10 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
