---
generator: chalk-protocol
id: "task-4a803e9c"
name: "fix: review-stage failures auto-block as human-input without surfacing findings or retrying"
overview: "When the `review` stage fails, the block reason includes the reviewer's blocking finding text (from `task.reviews`) rather than the generic `pipeline stage 'review' failed`."
created: "2026-06-25T22:43:49.083Z"
todos:
  - id: "task-4a803e9c-c1"
    content: "When the `review` stage fails, the block reason includes the reviewer's blocking finding text (from `task.reviews`) rather than the generic `pipeline stage 'review' failed`."
    status: done
  - id: "task-4a803e9c-c2"
    content: "A transient/non-deterministic review failure does not permanently wedge the task (e.g. retry the review stage once before auto-blocking, or otherwise distinguish a review failure from genuine human-input)."
    status: done
  - id: "task-4a803e9c-c3"
    content: "A test asserts that a failed review stage produces a block whose reason contains the reviewer's finding text."
    status: done
---

# fix: review-stage failures auto-block as human-input without surfacing findings or retrying

> state: **done** · phase: discovery

## Objective

- When the `review` stage fails, the block reason includes the reviewer's blocking finding text (from `task.reviews`) rather than the generic `pipeline stage 'review' failed`.
- A transient/non-deterministic review failure does not permanently wedge the task (e.g. retry the review stage once before auto-blocking, or otherwise distinguish a review failure from genuine human-input).
- A test asserts that a failed review stage produces a block whose reason contains the reviewer's finding text.

## Reviews

- **pass** · 2026-06-25T22:54 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
