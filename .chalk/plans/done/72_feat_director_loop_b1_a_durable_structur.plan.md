---
generator: chalk-protocol
id: "task-e27fa89c"
name: "feat(director-loop): B1 · a durable, structured director-decision record"
overview: "chalk pending accept/redirect write through to a durable append-only record (.chalk/director.jsonl) with structured fields: at, verdict (accepted|redirected), choice, why, risk, taskId, by"
created: "2026-07-17T09:32:56.691Z"
todos:
  - id: "task-e27fa89c-c1"
    content: "chalk pending accept/redirect write through to a durable append-only record (.chalk/director.jsonl) with structured fields: at, verdict (accepted|redirected), choice, why, risk, taskId, by"
    status: done
  - id: "task-e27fa89c-c2"
    content: "The durable record survives a re-review that regenerates t.reviews[].decisions — accept/redirect history persists for the task's life, independent of the volatile per-review flags (fixes the #193 persistence finding)"
    status: done
  - id: "task-e27fa89c-c3"
    content: "A directorDecisions() store accessor reads the record back; chalk decisions surfaces the director's accepted/redirected calls"
    status: done
  - id: "task-e27fa89c-c4"
    content: ".chalk/director.jsonl is spine state — in SPINE_STATE_PATHS so it is excluded from review diffs and committed by intake (no bookkeeping churn in feature diffs)"
    status: done
---

# feat(director-loop): B1 · a durable, structured director-decision record

> state: **done** · phase: discovery

## Objective

- chalk pending accept/redirect write through to a durable append-only record (.chalk/director.jsonl) with structured fields: at, verdict (accepted|redirected), choice, why, risk, taskId, by
- The durable record survives a re-review that regenerates t.reviews[].decisions — accept/redirect history persists for the task's life, independent of the volatile per-review flags (fixes the #193 persistence finding)
- A directorDecisions() store accessor reads the record back; chalk decisions surfaces the director's accepted/redirected calls
- .chalk/director.jsonl is spine state — in SPINE_STATE_PATHS so it is excluded from review diffs and committed by intake (no bookkeeping churn in feature diffs)

## Locked tests (read-only — P6)

- `test/director-record.test.mjs`

## Reviews

- **pass** · 2026-07-17T09:41 · adversary
- **stale** · 2026-07-17T09:42 · amend-spec
- **pass** · 2026-07-17T09:47 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
