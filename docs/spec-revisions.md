# Revising an acceptance contract

Use `chalk context <task>` to read the current criteria and their IDs, such as `ac-1`.
Initial criteria and tests still use `chalk spec`. Once work or approval has started,
criteria additions require a reason. Extend the existing amendment command to
consolidate corrections into the current contract:

```sh
chalk amend-spec <task> --add "Refresh open route titles" --why "Cover the production rendering path"
chalk amend-spec <task> --replace ac-1 --criterion "Preserve the last-known-good cache on failure" --why "Clarify recovery behavior"
chalk amend-spec <task> --retire ac-2 --why "Superseded by the upstream contract"
chalk amend-spec <task> --test test/refresh.test.mjs --why "Extend the locked regression"
chalk amend-spec <task> --history
```

Replacement keeps the criterion's ID. Retirement removes it from the current list
without reusing its ID. New criteria receive new IDs. `context` and reviewer prompts
use the current list; `--history` returns the revision number, timestamps, reasons,
operations, before/after definitions and any invalidated approvals. A batch of
operations validates before it is saved. Concurrent amendments serialize through
the existing spine lock. Task writers holding an older revision fail with a
`specification changed` error instead of overwriting a newer contract; reload context
and retry the command. Every task must retain a criterion or locked test after an
amendment, including tasks that have not started. The unattended driver also checks
P1 before execution and blocks legacy empty contracts while continuing valid work.
Replace/retire IDs must already exist when the amendment begins; a batch cannot
refer to an ID it expects a new criterion to receive.

Legacy criteria without IDs remain readable. Context derives deterministic IDs
without rewriting the spine; the first amendment stores them. Newly inserted tasks
(including intake and discovery) store IDs immediately. No bulk migration is needed.

Amendments retire the active handoff pointer into revision history. The document is
preserved, but `context` and `next` no longer instruct a new session to resume its
superseded contract. A fresh `chalk handoff` records the current revision, advances
the document sequence without overwriting historical files, and becomes the active
resumption note. A contract change during narration refuses that handoff before it
can be attached.

Every amendment advances `specRevision`, including re-locking an unchanged test or
restoring earlier text. Verification receipts bind this revision, so prior receipts
remain historical evidence and cannot appear current after those operations. Fresh
verification is still required; this feature does not enable verification reuse.

A passing or blocking task review becomes stale. Prior findings remain in history;
a fresh review must reassess the full amended contract before issuing current
instructions. The old plan, criteria alignment and plan approval are also removed
from active task fields and retained in revision history. Regenerate the plan with
`chalk plan`, then re-align and re-approve where configured, verify and review again.
Planning regeneration preserves later pipeline stages and existing branch/PR records.
The pipeline's
verification shortcut is invalidated while branch, commit and PR records remain
available for resumption. An amendment to a completed task marks its completion
historical: it cannot satisfy dependencies, enter a release or be archived under the new contract.
`next`, `status`, `backlog` and context show that revalidation is needed. Run
`chalk start <task>` to begin that cycle. The prior completion, release and PR records
remain in revision history; start clears the old active branch/PR/worktree references
so a merged PR cannot be reused. Fresh completion records the accepted specification
revision and restores dependency/release eligibility. Board and plan projections, portal scope and completion statistics also distinguish the pending contract from historical completion. Archive selects and removes tasks under the amendment lock, so it cannot discard a task that became pending while waiting for admission.

`done` and `merge` enforce required plan and alignment approvals at completion.
`run` checks again after execution and before completing, so an executor amendment
cannot silently discard the human checkpoints. If those approvals are required,
the task waits for them through the existing blocked-task workflow. Merge requires
local verification of an invalidated contract even when remote CI is green; remote
CI failures or pending checks still block it. Fresh successful completion clears
the verification invalidation marker.

Required audits are also bound to the specification they examined. Merge and phase
admission reject an old green audit after any task's amendment, including restored
wording or unchanged test locks. Run `chalk audit` again; a contract change during
audit produces RED. Completion metadata and archival alone preserve the contract
identity. Legacy audits without sufficient identity are historical. Audits also bind
source and gate configuration; see [approval freshness](approval-freshness.md).

For amended tasks with an existing PR, `work` preserves the PR record and `commit`
records corrections locally. Run `chalk pr <task>` again to push the committed
candidate to that existing PR; it does not create a second PR. Merge refuses
uncommitted code or a remote branch that differs from the local commit, and reports
whether `chalk commit` or `chalk pr` is needed. Publication uses a normal
fast-forward push and confirms the remote ref; it never force-pushes over divergent
remote work. The review-fix loop's existing push path can also satisfy this check
when its candidate actually reached the remote.

Final merge admission rechecks the revision after publication's network calls and
holds the spine lock through the remote merge and completion write. Sanctioned
amendments serialize with this transaction. The merge lease cannot be stolen merely
because it is old while its owner is alive (or liveness is uncertain); expired leases
can still be recovered after the owner is confirmed dead. Other commands retain
their existing bounded lock wait and may need to retry after the merge finishes.

Release and promotion use the same protected lock from task selection through
publication and release bookkeeping, including retry paths. Failures release the
lock. Each attempted version records its selected task revisions in
`.chalk/local/releases/`; an interrupted release cannot resume publication if one
of those contracts changed between attempts. Recovery resolves tasks across live
and archived history, so archiving an unchanged, already-marked task does not strand
the remaining bookkeeping. A changed contract requires reconciliation of
the interrupted candidate before publication; revalidating a newer revision alone
does not approve the old release artifacts. Legacy interrupted releases without a
contract record are refused when amendments exist. These are local records, not
signed provenance or a replacement for candidate-bound release validation.

`chalk spec --criterion ... --why ...` uses the same revision and invalidation path
for additions. For compatibility, adding initial test locks during implementation
before approval still works with `chalk spec --test`; its reason is recorded as
initial test attachment. It cannot replace an existing lock. Changing a locked test
still requires `amend-spec --test --why` before editing and again to pin the final
contents. Test contents and hidden regression assertions are never placed in the
revision log.

These are local protocol records, not signed approvals or protection against manual
spine edits. Specification changes invalidate task approvals, and shared freshness
checks bind each approval to its relevant source and configuration. Complete
external toolchain/environment identity and verification reuse remain separate work.

Reviews also check the revision they started with before accepting a returned
verdict. If the canonical specification changes while a review is running (including
when the reviewer uses a separate linked worktree), `run` and `review` discard the
verdict before saving or posting it. Unblocking the task cannot revive that verdict;
run a fresh review against the amended contract.

PR review comments also name the specification revision they examined. Publication
holds the protected spine lock, so an amendment cannot land during the GitHub call;
an amendment afterward invalidates that scoped review. Comments do not authorize
merge independently of the required Chalk gates.

An interrupted archive may leave both archived and live copies of a task. Retrying
reconciles the archive with the current live record before removal, preserving its
full revision history. Readers select the newest revision across archive years;
an older copy cannot revive an obsolete audit. If archived history is newer than
the live candidate, archival refuses removal until that discrepancy is reconciled.

Reopening an amended completed task retires the old release, PR, branch and
worktree fields through the shared task-save path, including director redirects.
After revalidation, the task is eligible for a new release and cannot be archived
as though the old release shipped the revised contract. Phase admission likewise
holds the amendment lock through audit/review checks and the phase write; a
concurrent amendment cannot slip between an approval check and advancement.

Late task writers cannot reinsert an ID that has moved to the archive. Reload the
current context instead of restoring the returning command's old snapshot. Audit
and release admission reject unreadable archive history or a live contract older
than (or conflicting with) its archived copy. A newer live revision remains valid
during interrupted archive recovery.

Release tag-collision preflight runs before creating a recovery contract record.
A refusal before artifacts are produced therefore does not freeze the selected
task set or prevent the documented retry with `--no-tag`.
