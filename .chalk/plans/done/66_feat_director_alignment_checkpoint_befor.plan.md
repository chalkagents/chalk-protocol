---
generator: chalk-protocol
id: "task-8cf40444"
name: "feat(director): alignment checkpoint before build — human accepts the criteria/outcome, not just the plan"
overview: "protocol.director.required defaults off; when off, chalk work behaves exactly as today (no regression)"
created: "2026-07-17T07:57:38.513Z"
todos:
  - id: "task-8cf40444-c1"
    content: "protocol.director.required defaults off; when off, chalk work behaves exactly as today (no regression)"
    status: done
  - id: "task-8cf40444-c2"
    content: "With director.required on and criteria not accepted, chalk work AND the autonomous driver (chalk run) refuse before build, pointing the human at chalk align"
    status: done
  - id: "task-8cf40444-c3"
    content: "chalk align records task.criteriaAccepted = { at, by }; after alignment chalk work proceeds past the gate"
    status: done
  - id: "task-8cf40444-c4"
    content: "chalk align surfaces the task's acceptance criteria for the human to read before accepting (not blind), and refuses when there are no criteria yet"
    status: done
---

# feat(director): alignment checkpoint before build — human accepts the criteria/outcome, not just the plan

> state: **done** · phase: discovery

## Objective

- protocol.director.required defaults off; when off, chalk work behaves exactly as today (no regression)
- With director.required on and criteria not accepted, chalk work AND the autonomous driver (chalk run) refuse before build, pointing the human at chalk align
- chalk align records task.criteriaAccepted = { at, by }; after alignment chalk work proceeds past the gate
- chalk align surfaces the task's acceptance criteria for the human to read before accepting (not blind), and refuses when there are no criteria yet

## Locked tests (read-only — P6)

- `test/director-align.test.mjs`

## Reviews

- **pass** · 2026-07-17T08:10 · adversary
- **stale** · 2026-07-17T08:11 · amend-spec
- **pass** · 2026-07-17T08:13 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
