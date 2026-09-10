---
generator: chalk-protocol
id: "task-f644b066"
name: "feat: report verification coverage and audit scope precisely"
overview: "CLI and structured events distinguish passed, failed, deferred, unconfigured and stale checks; an unconfigured held-out audit never claims independent regression coverage."
created: "2026-09-08T07:55:40.900Z"
todos:
  - id: "task-f644b066-c1"
    content: "CLI and structured events distinguish passed, failed, deferred, unconfigured and stale checks; an unconfigured held-out audit never claims independent regression coverage."
    status: done
  - id: "task-f644b066-c2"
    content: "Verify status does not claim that review or release gates are open; deferred-only verification is labeled as having no executed checks; phase checks and held-out checks retain distinct outcomes."
    status: done
  - id: "task-f644b066-c3"
    content: "Document local evidence access, retention, source-manifest limitations and adoption; run the real suite and a phase-boundary audit."
    status: done
---

# feat: report verification coverage and audit scope precisely

> state: **done** · phase: discovery

## Objective

- CLI and structured events distinguish passed, failed, deferred, unconfigured and stale checks; an unconfigured held-out audit never claims independent regression coverage.
- Verify status does not claim that review or release gates are open; deferred-only verification is labeled as having no executed checks; phase checks and held-out checks retain distinct outcomes.
- Document local evidence access, retention, source-manifest limitations and adoption; run the real suite and a phase-boundary audit.

## Locked tests (read-only — P6)

- `test/verification-coverage.test.mjs`
- `test/review-read-only-workflows.test.mjs`

## Reviews

- **block** · 2026-09-09T00:04 · adversary
- **pass** · 2026-09-09T00:30 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
