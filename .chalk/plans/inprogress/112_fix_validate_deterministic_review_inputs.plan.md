---
generator: chalk-protocol
id: "task-96da0ef1"
name: "fix: validate deterministic review inputs before invoking the reviewer"
overview: "Before invoking a configured reviewer in Git, identify and display the execution directory, branch, immutable task base, HEAD, complete changed-file list and untracked files. Include committed, staged, unstaged and non-ignored untracked task changes in one base-relative review input; exclude Chalk spine state and protected content."
created: "2026-09-10T01:40:22.358Z"
todos:
  - id: "task-96da0ef1-c1"
    content: "Before invoking a configured reviewer in Git, identify and display the execution directory, branch, immutable task base, HEAD, complete changed-file list and untracked files. Include committed, staged, unstaged and non-ignored untracked task changes in one base-relative review input; exclude Chalk spine state and protected content."
    status: pending
  - id: "task-96da0ef1-c2"
    content: "Never fall back to the previous commit or the whole repository merely because the task diff is empty. Pin a base when work starts or branches; allow an explicit review --base ref for existing tasks. Refuse missing, invalid, unrelated or ambiguous bases and unresolved conflicts before reviewer invocation, without recording or retrying a verdict."
    status: pending
  - id: "task-96da0ef1-c3"
    content: "Persist the reviewed input manifest and fingerprint with the verdict. Preserve source observation, locked-test checks and the full adversarial rubric; base changes invalidate prior approval. Regression tests cover the reported untracked-file failure, mixed committed and working changes, empty inputs, pinned bases and actionable preflight rejection."
    status: pending
  - id: "task-96da0ef1-c4"
    content: "Use the existing complete-suite scheduler for this repository, with an explicit bounded 900000 ms test-command timeout. Support a validated positive per-gate timeoutMs option while retaining the default 600000 ms deadline; record the applied deadline with execution evidence. Every discovered test remains mandatory and timeout, failure or incomplete execution never opens the gate."
    status: pending
---

# fix: validate deterministic review inputs before invoking the reviewer

> state: **blocked** · phase: discovery

## Objective

- Before invoking a configured reviewer in Git, identify and display the execution directory, branch, immutable task base, HEAD, complete changed-file list and untracked files. Include committed, staged, unstaged and non-ignored untracked task changes in one base-relative review input; exclude Chalk spine state and protected content.
- Never fall back to the previous commit or the whole repository merely because the task diff is empty. Pin a base when work starts or branches; allow an explicit review --base ref for existing tasks. Refuse missing, invalid, unrelated or ambiguous bases and unresolved conflicts before reviewer invocation, without recording or retrying a verdict.
- Persist the reviewed input manifest and fingerprint with the verdict. Preserve source observation, locked-test checks and the full adversarial rubric; base changes invalidate prior approval. Regression tests cover the reported untracked-file failure, mixed committed and working changes, empty inputs, pinned bases and actionable preflight rejection.
- Use the existing complete-suite scheduler for this repository, with an explicit bounded 900000 ms test-command timeout. Support a validated positive per-gate timeoutMs option while retaining the default 600000 ms deadline; record the applied deadline with execution evidence. Every discovered test remains mandatory and timeout, failure or incomplete execution never opens the gate.

## Locked tests (read-only — P6)

- `test/review-inputs.test.mjs`
- `test/verification-timeout.test.mjs`

## Reviews

- **block** · 2026-09-10T02:39 · adversary
- **stale** · 2026-09-10T02:45 · amend-spec
- **block** · 2026-09-10T03:19 · adversary
- **stale** · 2026-09-10T03:25 · amend-spec
- **block** · 2026-09-10T03:49 · adversary
- **stale** · 2026-09-10T03:50 · amend-spec
- **block** · 2026-09-10T04:03 · adversary
- **stale** · 2026-09-10T04:04 · amend-spec
- **block** · 2026-09-10T04:12 · adversary
- **stale** · 2026-09-10T04:13 · amend-spec
- **block** · 2026-09-10T04:42 · adversary
- **stale** · 2026-09-10T04:44 · amend-spec
- **block** · 2026-09-10T05:01 · adversary
- **stale** · 2026-09-10T05:02 · amend-spec

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
