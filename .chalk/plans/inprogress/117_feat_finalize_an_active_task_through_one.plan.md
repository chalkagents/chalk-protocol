---
generator: chalk-protocol
id: "task-2c04dcc4"
name: "feat: finalize an active task through one guarded run"
overview: "Extend the existing chalk run driver with --finish <id> for exactly one already in-progress task. Skip executor invocation and require no executor configuration; preserve start time and attempts. Validate target, dependencies and incompatible flags before running gates; dry-run is read-only and identifies the actual execution directory, branch and task base."
created: "2026-09-10T08:29:20.226Z"
todos:
  - id: "task-2c04dcc4-c1"
    content: "Extend the existing chalk run driver with --finish <id> for exactly one already in-progress task. Skip executor invocation and require no executor configuration; preserve start time and attempts. Validate target, dependencies and incompatible flags before running gates; dry-run is read-only and identifies the actual execution directory, branch and task base."
    status: pending
  - id: "task-2c04dcc4-c2"
    content: "Run fresh verification and all existing configured test-adequacy and completion gates, then required adversarial review, then completion using only the actual verification result retained in the same process. Never load a receipt as execution authority. Check fresh source/spec/config approval, visible locked-test integrity and Git tracking, current review and completion approvals in the final serialized admission. Preserve source observation and full review rubric; a changed contract, failed gate or missing evidence must not complete."
    status: pending
  - id: "task-2c04dcc4-c3"
    content: "Revalidate retained verification output bytes before completion and reject damage. Keep new reviewer findings and decisions inspectable, report stage timings and receipt location, and support --force-rerun for a second verification after review. Each invocation begins with fresh verification; cross-command reuse and full external toolchain/environment identity remain deferred and clearly documented."
    status: pending
  - id: "task-2c04dcc4-c4"
    content: "Meaningful CLI regressions prove unchanged finish invokes verification once, never invokes executor, and completes only the selected task. Cover invalid target/dependencies, dry-run, forced rerun, failed verification, review BLOCK/error, source/spec/locked-test changes, untracked locked tests, and tampered local evidence. Preserve existing ordinary run and done behavior."
    status: pending
---

# feat: finalize an active task through one guarded run

> state: **in-progress** · phase: discovery

## Objective

- Extend the existing chalk run driver with --finish <id> for exactly one already in-progress task. Skip executor invocation and require no executor configuration; preserve start time and attempts. Validate target, dependencies and incompatible flags before running gates; dry-run is read-only and identifies the actual execution directory, branch and task base.
- Run fresh verification and all existing configured test-adequacy and completion gates, then required adversarial review, then completion using only the actual verification result retained in the same process. Never load a receipt as execution authority. Check fresh source/spec/config approval, visible locked-test integrity and Git tracking, current review and completion approvals in the final serialized admission. Preserve source observation and full review rubric; a changed contract, failed gate or missing evidence must not complete.
- Revalidate retained verification output bytes before completion and reject damage. Keep new reviewer findings and decisions inspectable, report stage timings and receipt location, and support --force-rerun for a second verification after review. Each invocation begins with fresh verification; cross-command reuse and full external toolchain/environment identity remain deferred and clearly documented.
- Meaningful CLI regressions prove unchanged finish invokes verification once, never invokes executor, and completes only the selected task. Cover invalid target/dependencies, dry-run, forced rerun, failed verification, review BLOCK/error, source/spec/locked-test changes, untracked locked tests, and tampered local evidence. Preserve existing ordinary run and done behavior.

## Locked tests (read-only — P6)

- `test/run-finish.test.mjs`

## Reviews

- **block** · 2026-09-10T08:58 · adversary
- **stale** · 2026-09-10T08:59 · amend-spec
- **block** · 2026-09-10T09:22 · adversary
- **stale** · 2026-09-10T09:23 · amend-spec

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
