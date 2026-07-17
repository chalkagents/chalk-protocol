---
generator: chalk-protocol
id: "task-7b477997"
name: "feat(director): reviewer emits a decision digest — the accept button, not just pass/block"
overview: "The reviewer prompt requests a DECISION DIGEST — the judgment calls the implementer made — each with blastRadius + reversibility, framed for accept/redirect, and requested EVEN ON A PASS"
created: "2026-07-17T07:57:38.509Z"
todos:
  - id: "task-7b477997-c1"
    content: "The reviewer prompt requests a DECISION DIGEST — the judgment calls the implementer made — each with blastRadius + reversibility, framed for accept/redirect, and requested EVEN ON A PASS"
    status: pending
  - id: "task-7b477997-c2"
    content: "parseVerdict extracts a decisions array when present but stays additive: a verdict with no decisions keeps the exact {verdict,findings} shape, so older reviewers and pinned contracts are unaffected"
    status: pending
  - id: "task-7b477997-c3"
    content: "chalk review renders the decision digest (on PASS and BLOCK) and records it on the task's review entry (t.reviews[].decisions)"
    status: pending
  - id: "task-7b477997-c4"
    content: "The shipped (share/agents) and dogfood (.claude/agents) chalk-reviewer definitions both describe the decisions output and stay in sync (agents-sync drift gate stays green)"
    status: pending
---

# feat(director): reviewer emits a decision digest — the accept button, not just pass/block

> state: **in-progress** · phase: discovery

## Objective

- The reviewer prompt requests a DECISION DIGEST — the judgment calls the implementer made — each with blastRadius + reversibility, framed for accept/redirect, and requested EVEN ON A PASS
- parseVerdict extracts a decisions array when present but stays additive: a verdict with no decisions keeps the exact {verdict,findings} shape, so older reviewers and pinned contracts are unaffected
- chalk review renders the decision digest (on PASS and BLOCK) and records it on the task's review entry (t.reviews[].decisions)
- The shipped (share/agents) and dogfood (.claude/agents) chalk-reviewer definitions both describe the decisions output and stay in sync (agents-sync drift gate stays green)

## Locked tests (read-only — P6)

- `test/review-digest.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
