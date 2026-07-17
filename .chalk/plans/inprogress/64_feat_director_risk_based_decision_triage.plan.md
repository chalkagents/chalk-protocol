---
generator: chalk-protocol
id: "task-167041a5"
name: "feat(director): risk-based decision triage + a director inbox — own the empty middle"
overview: "decisionRisk scores a decision from blastRadius × reversibility into low/med/high; an unknown field is treated as the middle (unknown is not safe)"
created: "2026-07-17T07:57:38.501Z"
todos:
  - id: "task-167041a5-c1"
    content: "decisionRisk scores a decision from blastRadius × reversibility into low/med/high; an unknown field is treated as the middle (unknown is not safe)"
    status: pending
  - id: "task-167041a5-c2"
    content: "chalk review ranks the decision digest highest-risk-first with a per-decision risk badge (composes on #192; the digest line format is unchanged so #192's locked test stays green)"
    status: pending
  - id: "task-167041a5-c3"
    content: "chalk pending is the director inbox: unresolved med/high-risk decisions across ALL tasks (from each task's latest review), ranked by risk, each with a stable <task>#<n> ref; an empty inbox reports cleanly"
    status: pending
  - id: "task-167041a5-c4"
    content: "chalk pending accept <ref> marks a decision accepted and drops it from the inbox; chalk pending redirect <ref> \"why\" records a course-correction and logs a decision; neither can re-resolve a resolved call"
    status: pending
---

# feat(director): risk-based decision triage + a director inbox — own the empty middle

> state: **in-progress** · phase: discovery

## Objective

- decisionRisk scores a decision from blastRadius × reversibility into low/med/high; an unknown field is treated as the middle (unknown is not safe)
- chalk review ranks the decision digest highest-risk-first with a per-decision risk badge (composes on #192; the digest line format is unchanged so #192's locked test stays green)
- chalk pending is the director inbox: unresolved med/high-risk decisions across ALL tasks (from each task's latest review), ranked by risk, each with a stable <task>#<n> ref; an empty inbox reports cleanly
- chalk pending accept <ref> marks a decision accepted and drops it from the inbox; chalk pending redirect <ref> "why" records a course-correction and logs a decision; neither can re-resolve a resolved call

## Locked tests (read-only — P6)

- `test/director-triage.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
