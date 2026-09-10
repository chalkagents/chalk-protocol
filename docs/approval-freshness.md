# Approvals belong to their inputs

Chalk records an input identity when an approval is produced. `done`, `merge`,
`phase`, and the unattended `run` driver use the same freshness checks before
accepting it. An old PASS or timestamp without sufficient identity is historical
evidence and does not open a gate. The refusal names the command to renew it.

| Approval | Relevant inputs | Renewal |
| --- | --- | --- |
| Criteria alignment | Current task contract, project specification, director configuration | `chalk align <task>` |
| Plan approval | Alignment scope, plan text, task questions, planner and planning configuration | `chalk approve-plan <task>` |
| Review | Current task contract, project specification, worktree source, visible locks, reviewer and verification configuration | `chalk review <task>` |
| Verification | Current task contract, project specification, worktree source, all checked visible locks, gate configuration | `chalk verify` |
| Audit | Live and archived contracts, project specification, root source, checked visible locks, verification and regression configuration | `chalk audit` |

Source identity uses the existing conservative manifest and file fingerprints,
including ordinary untracked inputs and tracked files. Same-size edits invalidate
the approval. Ignored generated output and routine Chalk bookkeeping are excluded;
visible contract tests remain inputs. Source rewrites that restore the same bytes
may still require renewal. Review execution observes source and canonical metadata
even when the reviewer runs in a separate worktree. Audit observes preparation,
phase checks and regression execution continuously, including the intervals
between them. Unavailable identity or observation fails closed.
Review observation begins before selecting the reviewer and preparing its prompt.
`work` and `run` retain verification input failures and `chalk verify` recovery
guidance; automated handoffs retain the same explanation.
Verification observes the canonical project specification throughout execution,
including an initially absent file. Audit binds the same visible integrity scope
as verification: active tasks in their own worktrees and completed tasks when
`all-locks` is configured. Changing that checked scope requires a fresh audit.
Verification approvals bind that complete scope too, so another task's changed
lock cannot pass `done` or merge admission after a successful check. Audit observes
archived contract files and archive-directory membership throughout execution;
restoring a changed archive or removing a temporary one does not erase the failure.
`done` and `run` perform final admission inside the task transaction, preserving
reviews recorded before completion instead of overwriting them with an older
snapshot. Git policy directories may be symlinked; observation tracks both the
policy and the symlink selector, including temporary redirects that are restored.
Work verification and merge-publication metadata also update the current task
transactionally, preserving reviews that arrive before those saves. Audit prepares
configured browser-output directories before observing inputs, so an unchanged
first run does not fail on Chalk's own output setup.
Review results append transactionally only while their predecessor history still
stands. An intervening verdict requires renewed review; the older result cannot
replace that history in manual, configured, or unattended review flows.
Git split-index reads refresh cache timestamps during preparation. Review and audit
detect that mode before invoking checks and direct the caller to run
`git update-index --no-split-index` in the affected worktree or submodule, then retry. That
materializes the same staged content; observation of membership changes remains
required throughout preparation and execution. Review diff reads disable optional
locks and automatic index-stat refresh. An audit that fails observation preflight
reports that its phase and regression commands did not execute.
Between gates, ordinary Git upstream bookkeeping does not alter the effective
source manifest. During execution, the observer still protects Git membership and
policy inputs. Adequacy probes that restore source are followed by fresh verification.
Admission re-enumerates the current manifest without preparing execution watchers;
Git submodules retain the full scan for fingerprint compatibility. This endpoint
identity cannot be used as an execution-monitor baseline. No approval is cached.

Implementation edits do not invalidate criteria alignment or a plan approval by
themselves. Those approvals authorize the work that follows them. Changing the
contract, plan or relevant configuration requires the corresponding human
checkpoint again when that checkpoint is configured.

Green remote CI buckets do not identify the local source, specification or gate
configuration. Merge continues to reject failing or pending CI, and runs local
verification before admitting the current candidate. The existing review and
recording requirements still apply.
Merge requires committed implementation inputs and checked visible tests, and
requires the PR's actual head to equal that local commit. Unpublished changes
require `chalk commit` and `chalk pr` before merging. The provider must support
`pr view --json headRefOid,state` and `pr merge --match-head-commit`; unavailable
identity fails closed. Completion requires confirmation that the approved head
merged. A queued merge remains unfinished until the provider confirms it.
Recovery uses the PR's retained head identity even after its source branch is deleted.
`chalk pr` refreshes the committed candidate for existing PRs, including follow-up
commits without a specification amendment. Merge refuses candidate index flags
that let Git skip checking working files (assume-unchanged, skip-worktree, and
fsmonitor-valid), and prints commands to clear them before renewed admission.
It also compares raw working bytes and executable modes with commit objects,
including initialized submodules, so clean filters and Git mode settings cannot
substitute different committed inputs. Protected regression paths are excluded.

These are local approval records, not signed provenance. The identity includes the
Node runtime and platform; it does not establish a complete external SDK or
environment identity. No successful verification is reused by `done`: it still
runs fresh checks and test integrity. Safe command-result reuse and a protected
toolchain runner remain separate work.

For this repository's development checkout, `node scripts/verify-tests.mjs` runs
all tests: adapter conformance and release lock-entry probes execute serially, then the remaining integration
tests use four workers. Either batch failing closes verification. The scheduler
discovers nested `.test.mjs` files and rejects unfamiliar layouts instead of
silently skipping them. This addresses observed process-startup contention; it
does not change the project's verification deadline or any locked assertion.

Human alignment and plan approvals are admitted inside the task transaction and
update only their own approval field. All whole-task upserts preserve recorded
review verdicts, findings and input identities: a stale planning, queue or
bookkeeping snapshot cannot restore an older PASS over a later BLOCK. Director
annotations within a review's decision digest remain editable.

The release lock fixture retains its 1.5-second competing-process deadline. It
runs in the serial batch after an observed concurrent-suite failure followed by
all six release tests passing in isolation; no release assertion or timeout was
relaxed. This is scheduling mitigation, not a measured runtime improvement.

The integration batch starts the long pipeline file first to overlap its work
with shorter files. This follows a full run that reached 889 of 891 test results
without assertion failures before the unchanged 600-second verification deadline.
The scheduler still runs every discovered test exactly once.
