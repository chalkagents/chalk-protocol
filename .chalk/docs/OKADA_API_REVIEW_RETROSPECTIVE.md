# Okada API review efficiency follow-up

User-supplied evidence: SOAP/OTP characterization and notification delivery validation,
https://github.com/XtendlyORG/okada-api/pull/321 and
https://github.com/XtendlyORG/okada-api/pull/322. Both were preparation tasks, not
production fixes, merges or deployments. Seven reviewer invocations took approximately
31 minutes of reviewer runtime, excluding implementation and verification. Tokens and
a comparable workflow without Chalk were not measured.

Preserve the substantive notification finding: tests must fail when database writes
are no longer awaited. Deferred-promise tests exercised ordering and rejection. Fewer
BLOCK verdicts alone would not demonstrate improved efficiency.

Implementation sequence:

1. task-96da0ef: deterministic review inputs. Pin the base; include untracked files;
   display directory, branch, revision and files; refuse ambiguous input before a model
   invocation; persist the reviewed manifest. See docs/review-inputs.md.
2. task-3cbf419: inspect existing source-bound receipts and automatic review attachment;
   close stale-running-state and PR-description gaps without duplicating that machinery.
3. task-971d7e8: retain timeout, invalid output, permission and read-only mutation
   diagnostics; retry only appropriate transient failures. Two historical empty outputs
   were observed. Ignored log writes clearing output are a plausible, unconfirmed cause.
4. task-8e56898: explicit worktree binding and protected, isolated reviewer execution.
   Do not make the whole review workspace writable to allow runtime log writes.

Later slices: follow-up finding continuity with broader review when affected behavior
changes; configurable review intensity that preserves mandatory checks; outcome tracking
that separates preparation, implementation, verification, merge and deployment, linked
to parent issues. Do not equate completed preparation with delivered fixes.

Measure reviewer invocations and runtime, tokens when the provider supplies them,
substantive findings, infrastructure failures and evidence reuse. Compare equivalent
work before claiming speedups. Existing duration/cost data should be extended rather
than replaced. This retrospective supplies no measured token overhead or speedup.

Repository follow-up, outside this Chalk-only change: include the separately run
TypeScript check in okada-api's verification gate. No app repository changes are made.

## Implementation checkpoint — 2026-09-10

The user raised the elapsed time after roughly three hours. Further expensive gates
are paused for direction. Task `task-96da0ef1` remains **in-progress**, with no review
PASS or completion claim. Source changes are committed on `fix/deterministic-review-inputs`;
the portable protected-path fixture correction is commit `1e9d586`.

Implemented candidate behavior includes immutable bases, complete visible untracked
and tracked candidates, explicit execution manifests, preflight rejection of ambiguous
inputs, canonical protected-path exclusions, executable-mode capture and actual reused
branch baselines. Unsupported Git transformations and submodule inputs are refused.
Per-gate deadlines are bounded and recorded. Publication lock-entry tests run in the
existing serial batch, with explicit placement coverage and unchanged lock assertions.

Measured local gate work for this task:

- Seven Codex reviews: 2,287.920 seconds (38.132 minutes), all BLOCK verdicts.
- Nine completed full-suite commands: 5,590.038 seconds (93.1673 minutes), including
  five passing runs and four failed/timed-out runs. One additional interrupted run
  still has an incomplete local receipt; its duration is not included.
- Implementation, focused tests, rework, interruptions and tool/approval waits were
  not separately measured. These figures do not establish speedups or token overhead.

The most recent complete run, `7ca60c59-e4d0-41bf-b16c-887041a34530`, had 923 passes
and one Windows-exclusion-policy failure; visible locked-test integrity passed. The
new fixture's Windows skip was replaced by portable path setup, and both protected-path
cases plus the unchanged Windows policy check passed afterward (3/3). The locked test
was re-locked through `chalk amend-spec`; the final bytes have no fresh full-suite receipt.

The latest review found literal POSIX backslashes were wrongly normalized in protected
paths. The fix and direct/canonical-alias regressions are committed, but have not received
a subsequent PASS. Resume with fresh `chalk verify`, then `chalk review task-96da0ef1
--no-retry`, then `chalk done task-96da0ef1` only after the gates pass. Do not reuse earlier
GREEN results as completion evidence. No force-review or completion-state editing was used.

The evidence, diagnostics and worktree follow-ups remain queued. Earlier task contracts
whose locked fixtures were legitimately amended retain the states assigned by Chalk;
this checkpoint does not restore their old completion claims.
