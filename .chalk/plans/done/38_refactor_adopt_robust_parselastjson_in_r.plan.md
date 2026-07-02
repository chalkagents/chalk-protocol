---
generator: chalk-protocol
id: "task-9e75f32d"
name: "refactor: adopt robust parseLastJson in retro/feedback/discovery (kill the duplicated greedy JSON regex)"
overview: "runRetro/runFeedback/runDiscovery recover their JSON payload ({lessons,issues}/{issues}/{tasks}) even when the agent wraps it in reasoning/prose with stray braces"
created: "2026-07-01T01:55:14.074Z"
todos:
  - id: "task-9e75f32d-c1"
    content: "runRetro/runFeedback/runDiscovery recover their JSON payload ({lessons,issues}/{issues}/{tasks}) even when the agent wraps it in reasoning/prose with stray braces"
    status: done
  - id: "task-9e75f32d-c2"
    content: "all three use the shared robust parseLastJson instead of the duplicated greedy /{...}/ regex"
    status: done
---

# refactor: adopt robust parseLastJson in retro/feedback/discovery (kill the duplicated greedy JSON regex)

> state: **done** · phase: discovery

## Objective

- runRetro/runFeedback/runDiscovery recover their JSON payload ({lessons,issues}/{issues}/{tasks}) even when the agent wraps it in reasoning/prose with stray braces
- all three use the shared robust parseLastJson instead of the duplicated greedy /{...}/ regex

## Locked tests (read-only — P6)

- `test/agent-json.test.mjs`

## Reviews

- **pass** · 2026-07-01T01:58 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
