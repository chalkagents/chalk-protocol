---
generator: chalk-protocol
id: "task-f4376c4c"
name: "feat: bind gate approvals to current inputs"
overview: "Done, merge, phase and automated callers use shared freshness checks over the source, spec and configuration relevant to each approval."
created: "2026-09-08T07:55:41.390Z"
todos:
  - id: "task-f4376c4c-c1"
    content: "Done, merge, phase and automated callers use shared freshness checks over the source, spec and configuration relevant to each approval."
    status: pending
  - id: "task-f4376c4c-c2"
    content: "Same-size source edits invalidate audits; legacy records without sufficient identity are historical rather than freshly approved; failures identify an actionable recovery command."
    status: pending
  - id: "task-f4376c4c-c3"
    content: "Integration umbrella after the user-approved scope reset: preserve the existing criteria and locked tests, and leave this task unfinished until independently scoped review-history, freshness and publication changes have passed their own gates. Do not resume the combined review loop."
    status: pending
---

# feat: bind gate approvals to current inputs

> state: **blocked** · phase: discovery

## Objective

- Done, merge, phase and automated callers use shared freshness checks over the source, spec and configuration relevant to each approval.
- Same-size source edits invalidate audits; legacy records without sufficient identity are historical rather than freshly approved; failures identify an actionable recovery command.
- Integration umbrella after the user-approved scope reset: preserve the existing criteria and locked tests, and leave this task unfinished until independently scoped review-history, freshness and publication changes have passed their own gates. Do not resume the combined review loop.

## Locked tests (read-only — P6)

- `test/director-align.test.mjs`
- `test/spec-audit.test.mjs`
- `test/approveplan.test.mjs`
- `test/mergegate.test.mjs`
- `test/brokecheck.test.mjs`
- `test/approval-freshness.test.mjs`
- `test/spec-amendment-admission.test.mjs`
- `test/spec-archive-resurrection.test.mjs`
- `test/protocol.test.mjs`
- `test/pipeline.test.mjs`
- `test/approval-source.test.mjs`
- `test/adapter-conformance-startup.test.mjs`
- `test/approval-current-review.test.mjs`
- `test/verification-scheduling.test.mjs`
- `test/approval-review-findings.test.mjs`
- `test/approval-execution-boundary.test.mjs`
- `test/approval-audit-observation.test.mjs`
- `test/approval-integrity-history.test.mjs`
- `test/approval-completion-transaction.test.mjs`
- `test/approval-policy-symlink.test.mjs`
- `test/approval-merge-publication.test.mjs`
- `test/approval-audit-output-preparation.test.mjs`
- `test/spec-merge-transaction.test.mjs`
- `test/approval-review-transaction.test.mjs`
- `test/approval-merge-candidate.test.mjs`
- `test/gate-hardening.test.mjs`
- `test/review-stage-order.test.mjs`
- `test/approval-human-transaction.test.mjs`

## Reviews

- **block** · 2026-09-09T19:16 · adversary
- **stale** · 2026-09-09T19:23 · amend-spec
- **block** · 2026-09-09T19:49 · adversary
- **stale** · 2026-09-09T20:03 · amend-spec
- **block** · 2026-09-09T20:49 · adversary
- **stale** · 2026-09-09T20:54 · amend-spec
- **block** · 2026-09-09T21:16 · adversary
- **stale** · 2026-09-09T21:23 · amend-spec
- **block** · 2026-09-09T21:38 · adversary
- **stale** · 2026-09-09T21:45 · amend-spec
- **block** · 2026-09-09T22:10 · adversary
- **stale** · 2026-09-09T22:18 · amend-spec
- **block** · 2026-09-09T23:01 · adversary
- **stale** · 2026-09-09T23:06 · amend-spec
- **block** · 2026-09-09T23:38 · adversary
- **stale** · 2026-09-09T23:42 · amend-spec

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
