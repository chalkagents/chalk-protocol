---
generator: chalk-protocol
id: "task-fc11b71e"
name: "feat(director-loop): A2 · inject pending director corrections into buildContext"
overview: "buildContext surfaces a task's unresolved directives as a '### Director corrections (REBUILD to these)' block naming the corrected choice + what to do instead"
created: "2026-07-17T09:32:56.699Z"
todos:
  - id: "task-fc11b71e-c1"
    content: "buildContext surfaces a task's unresolved directives as a '### Director corrections (REBUILD to these)' block naming the corrected choice + what to do instead"
    status: pending
  - id: "task-fc11b71e-c2"
    content: "Only UNRESOLVED directives are injected — a resolved directive is not re-surfaced"
    status: pending
  - id: "task-fc11b71e-c3"
    content: "No directives → no block (no regression to existing context)"
    status: pending
  - id: "task-fc11b71e-c4"
    content: "The corrections block is ESSENTIAL — never dropped for the context budget (only the elastic lessons block is trimmed), like the review-findings block it mirrors"
    status: pending
---

# feat(director-loop): A2 · inject pending director corrections into buildContext

> state: **in-progress** · phase: discovery

## Objective

- buildContext surfaces a task's unresolved directives as a '### Director corrections (REBUILD to these)' block naming the corrected choice + what to do instead
- Only UNRESOLVED directives are injected — a resolved directive is not re-surfaced
- No directives → no block (no regression to existing context)
- The corrections block is ESSENTIAL — never dropped for the context budget (only the elastic lessons block is trimmed), like the review-findings block it mirrors

## Locked tests (read-only — P6)

- `test/director-context-inject.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
