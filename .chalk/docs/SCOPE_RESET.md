# Chalk improvement scope reset

User approved this reset after the combined approval-freshness task accumulated eight BLOCK reviews and repeated full-suite runs. The earlier run caught real defects, but it did not establish an efficiency benefit.

## Preserved work

- Integration umbrella: task-f4376c4, blocked on separately scoped upstream work; original criteria and all locked tests remain.
- Baseline commit: 59637da.
- Original pending changes: 54 files preserved in `.chalk/local/scope-reset/accumulated.patch`.
- Patch digest and individual file hashes: `.chalk/local/scope-reset/manifest.json`.
- No existing source work or historical test lock was discarded.

## Separate changes

| Slice | Task | Scope |
| --- | --- | --- |
| 1 | task-6285aa3 | Reject task saves that erase newer review results; preserve normal appends and director annotations. |
| 2 | task-51b4446 | Review/done approval freshness, prepared independently after slice 1. Audit/phase and runner/reuse work need separate scopes. |
| 3 | task-bbb5712 | Existing PR follow-up publication and matching candidate admission, prepared independently after slice 1. |

The original snapshot also contains verification scheduling and execution-observation work. Those remain parked proposals; do not introduce them as repairs to slice 1. Existing prerequisite/release/measurement tasks remain unfinished.

## First slice and budget

Worktree: `.chalk/local/scope-reset/review-history`, branch `fix/review-history-save`, based on 59637da. Production scope: `lib/store.mjs`. Regression scope: `test/review-history-save.test.mjs`.

- Focused tests before expensive gates; include a real planner-save interleaving and compatibility tests.
- Verify that removing the production fix makes the new regressions fail.
- At most one full `chalk verify` attempt and one native Codex review attempt.
- Only after both pass, allow the mandatory fresh `chalk done` verification once.
- Any RED, timeout, BLOCK, or need to expand production scope stops for reassessment. It never opens a gate or automatically launches another repair/review loop.
- Use the existing complete-suite command `node --test --test-concurrency=3 --test-reporter=tap`, which has recorded GREEN evidence in receipt b67cd4f9-6d1b-49bc-9908-e3f0bf6c2abb. The 600-second gate deadline is unchanged. No test is excluded.

## Evidence and value

The 20 focused tests passed in 3.92 seconds. The new regressions also fail against the unmodified baseline; the restored implementation is checked again before locking. This shows the safeguard catches a reproducible lost-review defect. It does not demonstrate faster delivery or reduced SDK sandbox friction.

Track full verification outcome/duration, Codex verdict/attempts, files changed, and any rework. Do not expand the protocol until the first slice has a reviewable outcome. Verification reuse, a protected runner, intake improvements and end-to-end speedup remain unclaimed.

## Budgeted attempt outcome

The first slice changed two files with 54 added lines. Twenty focused tests passed
in 3.92 seconds; the six new tests passed again in 0.54 seconds after the revert
check restored the implementation. Its independent patch is
`.chalk/local/scope-reset/01-review-history.patch`.

The single full verification attempt stopped during preflight in 1.126 seconds:
`invalid policy parent`. Receipt:
`.chalk/local/verification/ccc0e2c1-4fff-4c3b-9137-6b41e4589314/run.json`.
Executed checks: **0**. Visible integrity: **not established**. Verdict: **RED**.
Native Codex reviews attempted for this slice: **0**. Done attempts: **0**.

The task is blocked for a scope decision under the agreed budget. The verification
preflight dependency must receive its own bounded scope before retrying; do not
fold verification repairs into the store safeguard. No throughput improvement or
completed feature is claimed. The broad pending work remains preserved.

## Local commit checkpoints

User requested proper commits without completing or publishing the pending tasks.

- `fix/review-history-save`: `452d767`, isolated two-file store safeguard.
- `wip/approval-freshness-scope-reset`: `8c7a38f` adapter startup,
  `6c3ff49` verification scheduling, and `6ecb2c9` accumulated approval work.
- Canonical Chalk task, decision, plan and scope-reset records are committed
  separately from implementation changes.
- `dev` remains at `59637da`; these checkpoints are unmerged and unpushed.

Commit creation does not establish verification, review, or task completion.
The blockers and evidence limitations above remain in force.
