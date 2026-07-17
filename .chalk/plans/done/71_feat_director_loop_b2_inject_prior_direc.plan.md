---
generator: chalk-protocol
id: "task-6fec5f3f"
name: "feat(director-loop): B2 · inject prior director decisions into new-task context (the moat)"
overview: "buildContext injects a '## Director's calls so far (apply this taste)' block from the durable record (#201) on NEW tasks — accepted → 'apply this rationale', redirected → 'do this instruction' (distinct, per B1's schema)"
created: "2026-07-17T09:32:56.685Z"
todos:
  - id: "task-6fec5f3f-c1"
    content: "buildContext injects a '## Director's calls so far (apply this taste)' block from the durable record (#201) on NEW tasks — accepted → 'apply this rationale', redirected → 'do this instruction' (distinct, per B1's schema)"
    status: done
  - id: "task-6fec5f3f-c2"
    content: "The block is bounded like lessons (most-recent-first, elided with a note under a tight context budget); the task essentials (criteria/tests/directives) are never displaced"
    status: done
  - id: "task-6fec5f3f-c3"
    content: "No director decisions → no block (no regression to existing context)"
    status: done
---

# feat(director-loop): B2 · inject prior director decisions into new-task context (the moat)

> state: **done** · phase: discovery

## Objective

- buildContext injects a '## Director's calls so far (apply this taste)' block from the durable record (#201) on NEW tasks — accepted → 'apply this rationale', redirected → 'do this instruction' (distinct, per B1's schema)
- The block is bounded like lessons (most-recent-first, elided with a note under a tight context budget); the task essentials (criteria/tests/directives) are never displaced
- No director decisions → no block (no regression to existing context)

## Locked tests (read-only — P6)

- `test/director-compound.test.mjs`

## Reviews

- **pass** · 2026-07-17T10:41 · adversary
- **stale** · 2026-07-17T10:42 · amend-spec
- **pass** · 2026-07-17T10:44 · adversary
- **stale** · 2026-07-17T10:46 · amend-spec
- **pass** · 2026-07-17T10:48 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
