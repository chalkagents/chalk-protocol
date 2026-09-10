---
generator: chalk-protocol
id: "task-3689504d"
name: "feat: persist verification runs with source-bound evidence"
overview: "Every verify invocation, including done and automated callers, stores a unique local run with commands, complete stdout/stderr logs, timestamps, exit/signal/error status, source fingerprints, effective verification configuration and matching task criteria/test identity."
created: "2026-09-08T07:55:03.324Z"
todos:
  - id: "task-3689504d-c1"
    content: "Every verify invocation, including done and automated callers, stores a unique local run with commands, complete stdout/stderr logs, timestamps, exit/signal/error status, source fingerprints, effective verification configuration and matching task criteria/test identity."
    status: done
  - id: "task-3689504d-c2"
    content: "Source identity includes tracked and ordinary untracked inputs and excludes protocol bookkeeping, held-out content and ignored build output; unknown identity or inputs changing during a run are reported and cannot produce green verification."
    status: done
  - id: "task-3689504d-c3"
    content: "Passing, failing, timed-out and interrupted subprocess results retain evidence without shell-buffer truncation; failures to persist evidence fail verification explicitly; existing integrity and toolchain behavior remains covered."
    status: done
---

# feat: persist verification runs with source-bound evidence

> state: **done** · phase: discovery

## Objective

- Every verify invocation, including done and automated callers, stores a unique local run with commands, complete stdout/stderr logs, timestamps, exit/signal/error status, source fingerprints, effective verification configuration and matching task criteria/test identity.
- Source identity includes tracked and ordinary untracked inputs and excludes protocol bookkeeping, held-out content and ignored build output; unknown identity or inputs changing during a run are reported and cannot produce green verification.
- Passing, failing, timed-out and interrupted subprocess results retain evidence without shell-buffer truncation; failures to persist evidence fail verification explicitly; existing integrity and toolchain behavior remains covered.

## Locked tests (read-only — P6)

- `test/verification-record.test.mjs`
- `test/verification-record-boundaries.test.mjs`
- `test/verification-source-metadata.test.mjs`
- `test/verification-lifecycle.test.mjs`
- `test/verification-supervision.test.mjs`
- `test/verification-contract-freeze.test.mjs`
- `test/verification-audit-policy.test.mjs`
- `test/verification-recovery-boundaries.test.mjs`
- `test/verification-audit-freshness.test.mjs`
- `test/verification-stream-policy.test.mjs`
- `test/verification-policy-authorities.test.mjs`
- `test/verification-index-membership.test.mjs`
- `test/verification-policy-selection.test.mjs`
- `test/verification-repository-selection.test.mjs`
- `test/verification-descendant-selection.test.mjs`
- `test/verification-retention.test.mjs`
- `test/verification-capture-authority.test.mjs`
- `test/verification-literal-boundaries.test.mjs`
- `test/verification-policy-notifications.test.mjs`
- `test/verification-git-paths.test.mjs`
- `test/verification-config-newlines.test.mjs`
- `test/verification-lifecycle-continuity.test.mjs`
- `test/verification-observed-manifest.test.mjs`
- `test/verification-finalization.test.mjs`
- `test/verification-completion-boundary.test.mjs`
- `test/verification-observer-drain.test.mjs`
- `test/verification-observer-classification.test.mjs`
- `test/verification-namespace-boundary.test.mjs`
- `test/verification-namespace-lifecycle.test.mjs`
- `test/verification-absent-authorities.test.mjs`
- `test/verification-cli-diagnostics.test.mjs`
- `test/verification-absent-tracked.test.mjs`
- `test/verification-absent-membership.test.mjs`
- `test/verification-symlink-metadata.test.mjs`
- `test/verification-shared-startup.test.mjs`

## Reviews

- **block** · 2026-09-08T10:06 · adversary
- **block** · 2026-09-08T10:28 · adversary
- **block** · 2026-09-08T11:02 · adversary
- **block** · 2026-09-08T11:31 · adversary
- **block** · 2026-09-08T11:50 · adversary
- **block** · 2026-09-08T13:10 · adversary
- **block** · 2026-09-08T13:23 · adversary
- **block** · 2026-09-08T14:33 · adversary
- **block** · 2026-09-08T14:52 · adversary
- **block** · 2026-09-08T15:28 · adversary
- **block** · 2026-09-08T15:44 · adversary
- **block** · 2026-09-08T16:04 · adversary
- **block** · 2026-09-08T16:31 · adversary
- **block** · 2026-09-08T17:07 · adversary
- **block** · 2026-09-08T17:33 · adversary
- **block** · 2026-09-08T18:09 · adversary
- **block** · 2026-09-08T18:30 · adversary
- **block** · 2026-09-08T18:54 · adversary
- **block** · 2026-09-08T19:27 · adversary
- **block** · 2026-09-08T20:28 · adversary
- **block** · 2026-09-08T20:49 · adversary
- **block** · 2026-09-08T21:04 · adversary
- **pass** · 2026-09-08T21:28 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
