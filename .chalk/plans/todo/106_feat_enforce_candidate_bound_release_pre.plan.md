---
generator: chalk-protocol
id: "task-5b3d0076"
name: "feat: enforce candidate-bound release prerequisites"
overview: "An opt-in release workflow stores candidate source/artifact identity and check/sign-off prerequisites separately from coding-task completion; replacement candidates invalidate affected sign-offs."
created: "2026-09-08T07:55:41.857Z"
todos:
  - id: "task-5b3d0076-c1"
    content: "An opt-in release workflow stores candidate source/artifact identity and check/sign-off prerequisites separately from coding-task completion; replacement candidates invalidate affected sign-offs."
    status: pending
  - id: "task-5b3d0076-c2"
    content: "Release side effects require current configured prerequisites at every entry point and support safe retries; QA artifact preparation is distinct from production publication."
    status: pending
  - id: "task-5b3d0076-c3"
    content: "Human-required approvals must have an explicit trusted authorization mechanism, not a caller-supplied name; missing project workflow or authorization inputs are surfaced as human blockers."
    status: pending
---

# feat: enforce candidate-bound release prerequisites

> state: **specd** · phase: discovery

## Objective

- An opt-in release workflow stores candidate source/artifact identity and check/sign-off prerequisites separately from coding-task completion; replacement candidates invalidate affected sign-offs.
- Release side effects require current configured prerequisites at every entry point and support safe retries; QA artifact preparation is distinct from production publication.
- Human-required approvals must have an explicit trusted authorization mechanism, not a caller-supplied name; missing project workflow or authorization inputs are surfaced as human blockers.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
