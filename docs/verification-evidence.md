# Local verification evidence

`chalk verify` writes a separate receipt for each invocation under
`.chalk/local/verification/<run-id>/run.json`. The verification invoked by `done`
and the phase verification invoked by `audit` use the same recorder. Each executed
toolchain or browser command has full stdout/stderr files, start and finish times,
its command, exit status, signal and execution errors. Skipped and deferred gates
remain explicit. The CLI prints the receipt location.
Both `verify` and `done` print that location when a receipt is available, including
failed verification. Source-identity and storage errors explain why completion is
blocked; a storage failure before receipt creation may have no receipt to link.

The receipt binds the run to source inputs, effective gate configuration, task
criteria and locked-test identities. Inputs are captured before and after execution;
a continuous observer also detects temporary changes across command handoffs,
integrity checks, archive validation and final input collection. Unknown
identity, observed input changes, failed commands or failed evidence storage keep
verification closed. Contracts are captured before commands execute, so a command
cannot temporarily remove a test lock to change the integrity check.

## Input boundaries

In Git workspaces, tracked files and ordinary untracked files are inputs. Tracked
files remain inputs even when an ignore rule matches them. Ignored untracked output,
protocol bookkeeping and held-out content are excluded; visible `.chalk/tests/`
contracts remain inputs. Outside Git, the scan conservatively includes ordinary
files without guessing generated directories. External symlink targets produce
unknown identity rather than silently omitting an input.
Symlink identities include the target and the link's initial device/inode, mode and
nanosecond modification/change timestamps. Restoring the original target after
replacement cannot discard that initial metadata at observer startup.
If a tracked input is absent at capture, its nearest existing parent remains bound
even inside an ignored directory. Creating/removing that input or sibling entries
closes the gate; unchanged absence alone does not. Restore required tracked inputs
before verification, or keep their parent namespace stable. Absent recorded Git
indexes and repository selectors receive the same parent protection.
Configured excluded directory names are literal filesystem paths; characters such
as `[` cannot turn an exclusion into a glob that hides unrelated source.
Git path discovery preserves significant whitespace, including trailing spaces in
external ignore/config filenames and repository directory names.
An explicit Git configuration override identifies one file, including embedded
newlines when the filesystem supports them. Ambiguous newline-delimited default
global discovery produces unknown identity; an explicit `GIT_CONFIG_GLOBAL` path
can establish an unambiguous boundary.

Git configuration and ignore-policy files are also bound and monitored, including
configured external ignore files. Their contents are hashed rather than copied
into the receipt. This prevents changing ignore rules during a command from hiding
a temporary ordinary input. The branch reference (`HEAD`) and shared-worktree
configuration selector (`commondir`) are bound too, since switching selectors can
activate different rules without editing the configuration files themselves.
This includes ancestor ignore files through the Git root and configuration files
that are absent or empty at startup. For absent authorities and an absent visible
`.chalk/tests` tree, Chalk binds the nearest existing parent's namespace. Sibling
entry changes in those directories conservatively close the gate, including unrelated
changes whose relationship to the missing authority cannot be established. Prepare
these directories before verification and keep them stable during the run.
Chalk prepares its configured browser report directory before capturing inputs, so
normal report creation follows the same rule without manual preparation.
An ordinary missing `.gitignore` below an already ignored ancestor cannot re-include
its children under [Git's ignore rules](https://git-scm.com/docs/gitignore), so it
does not turn that output directory into source. Explicit configuration includes and
`core.excludesFile` remain authorities even inside ignored directories.
Git must support `git var GIT_CONFIG_SYSTEM`
and `git var GIT_CONFIG_GLOBAL` so Chalk can locate its configuration authorities;
if discovery is unavailable, identity is unknown and verification stays closed.
Git index writes during execution also invalidate the run: intermediate tracking
changes cannot be reconstructed reliably from the final index. Stage files before
verification. Staging unchanged ordinary inputs between runs preserves their source
identity; index metadata is compared only within an individual run.
Repository discovery is monitored on the same within-run basis: `.git` files and
directories, absent nearer `.git` candidates in nested projects, and selected Git
directories cannot be swapped during execution to select different input rules.
This also covers selectors in descendant directories used to classify filesystem
events, including an initially empty directory that temporarily becomes a repository.

A directory-only ignore such as `/build/` cannot identify an earlier event's type:
an ordinary file named `build` would not match that rule. If a command creates and
deletes or replaces that path before notifications arrive, its current type may
differ. A directory-specific rule matching the changed path itself therefore fails
closed when its earlier type is unknown. An ignored ancestor is different: a child
event necessarily had a directory at that ancestor, so generated `build/output.log`
remains excluded even when a force-tracked `build/.gitkeep` makes Chalk watch there.
Prepare generated directories before verification and keep them present. Chalk binds
source-directory device/inode and nanosecond change/modification timestamps before
execution. Creating and removing a path changes that directory identity even if its
notification is missing. This closes the gate with a `source-directory:` diagnostic;
received ignored-output notifications never reset that baseline. This also means
creating or removing an ignored output directory beside source closes the gate, even
with a type-independent ignore such as `/build`. Write generated files inside a
pre-existing ignored directory instead. Source directories remain stable; contents
inside excluded output directories may change. Do not ignore source or tests to clear
a gate. Directory identities are recorded separately from the source-content digest.
Source, policy and membership metadata checks supplement notifications at completion,
retaining change diagnostics for persistent or restored writes even when callbacks
arrive too late. Submodule source directories obey the same namespace rule; files
inside their pre-existing ignored output directories remain excluded, and their
tracked child inputs are checked separately.
The final source identity re-hashes the initial manifest while the observer protects
its membership, recorded as `manifest: "observed-initial"`. It does not re-enumerate
Git inputs: even Git read operations refresh shared-index timestamps. New paths and
transient membership changes invalidate the run through the observer; unchanged
shared indexes remain valid. Shared-index metadata is captured after the initial Git
probes and retained across observer startup and finalization. Later commands that
refresh that metadata count as changes; perform those Git operations before verification.
After installing watchers, the observer reconciles membership against existing paths
so files created between the initial scan and observer startup cannot escape the
manifest. Task/config authorities and visible locked-test paths are explicitly
watched even when they lie outside the ordinary source tree. Observer startup or
response failure closes the gate.

## Execution and trust

Logs are streamed to temporary local storage, then archived with the receipt.
The supervisor computes each stream's byte count and SHA-256 from received chunks,
then checks the still-open capture descriptor against those values before closure.
If the live pathname was replaced, it copies recoverable descriptor output into
new private storage. Replaced or truncated capture data fails the command; remaining
partial output is not presented as complete. Recovery copies remain
until the whole verification checks all retained archives. If a later gate deletes,
truncates or redirects earlier output, verification fails and restores the archive
from a matching recovery copy when possible. Recovery replaces the log entry rather
than following a redirected symlink into source. Temporary copies are released only
after complete archives and the final receipt have been persisted successfully.
Archives are revalidated after final input collection while both source and archive
observers remain active. Archive metadata and notifications protect earlier streams
through the final sequential checks and observer drain. The observer's final reads,
metadata checks and ignore classification are asynchronous, so slow I/O cannot block
other change notifications. Git classification has a small concurrency limit; pending
classification and archive callbacks settle before observers close. The final event
drain follows those checks, with no file reads or hashing after watcher closure.
Detected damage remains a failure even when matching recovery bytes restore the archive.
The receipt's `finishedAt` is a historical boundary after command execution and archive
validation. The observer then checks source, policy, directory and archive endpoint
identities before accepting that boundary; a notification timer alone cannot establish
freshness. Writes during these endpoint checks may conservatively reject the run too.
Receipt persistence records that boundary. Any later consumer
must validate retained bytes again, since subsequent host writes can damage evidence.
Recovery copies are released only after a successful receipt has been persisted.
Initial archival, recovery and metadata writes all use unique temporary files and
atomic destination replacement. The original storage directory's location and
filesystem identity remain bound across gates; replaced or redirected parents are
rejected before writing, including on error-reporting paths.
Interrupted runs retain recoverable log references when the supervisor can handle
the interruption. Storage errors are failures, not successful verification. Abrupt
host shutdown or an uncatchable supervisor kill can leave a running receipt; it is
not evidence of success. Full logs can contain tool output or secrets printed by
commands: they remain local and are not automatically committed or uploaded.
If a stream cannot be written, the supervisor terminates the command and records
a failed, finished outcome with a capture error; any retained log is incomplete.
Timeout and controller interruption kill the original process group. If a descendant
escapes that group and retains output pipes, the supervisor stops waiting after a
one-second cancellation grace period and marks `outputComplete: false`. Received
bytes remain archived, but later descendant output is unavailable. This bounds
receipt completion; it does not claim that an escaped process was terminated.

These receipts describe execution by the invoking host. They are not signed
attestations, proof against a hostile host, independently rerun reviewer tests, or
held-out regression coverage. Monitoring requires working filesystem notifications;
restricted environments that deny them cannot certify fresh inputs. Process-tree
supervision is covered on the development POSIX host; equivalent Windows behavior
has not been independently validated.

This slice records Node/platform identity but does not yet identify every external
SDK, dependency installation or relevant environment input. Reviewer toolchain
preflight and safe reuse by `done` are subsequent
work. `done` continues to run verification. Within a run, changes to task/config
authority files conservatively invalidate the result, including unrelated concurrent
bookkeeping; later reuse must compare the relevant semantic inputs instead.

## Finish already implemented work

For an already started task, use the existing run driver without invoking an executor:

```sh
chalk run --finish <id> --dry-run
chalk run --finish <id>
```

Finish selects only that in-progress task. It displays the execution directory, actual
branch and task base, verifies prerequisites, and runs fresh verification, configured
test-adequacy checks, required adversarial review and serialized completion admission.
It preserves the original start time and implementation-attempt count. No executor
configuration is needed. Stage newly locked tests before running it.

An unchanged finish normally runs the configured verification commands once. The
driver retains the actual result in memory and rechecks source/specification/configuration
approval, current review, visible locks, tracking and retained evidence at completion.
It does not load an earlier receipt to authorize completion. Missing or changed output
or receipt bytes block admission, including observed writes that restore the original
bytes. A failed gate leaves the task unfinished with a recorded reason. Review BLOCKs
and diagnostics are displayed; this mode does not retry a reviewer automatically.
Configured adequacy probes that cannot execute block finish as inconclusive. The
initial semantic verification approval remains binding across probes and reruns;
changing criteria without incrementing a revision cannot replace the original contract.
The initial review/completion policy is bound too, so a probe cannot disable mandatory
review or other completion requirements. The existing adequacy helpers operate on
uncommitted implementation changes from HEAD. If configured probes cannot cover the
task's committed implementation changes, finish refuses that scope before verification;
it does not silently skip them. Bookkeeping-only commits do not trigger this refusal.
Projects using those probes should run them before committing implementation changes;
support for probing arbitrary committed task deltas remains separate work.

`--force-rerun` requests a second verification after review. Adequacy probes that alter
the tree also retain the existing verification after restoration. Every new invocation
starts fresh: interrupted finish runs cannot resume from an editable receipt. After
fixing a blocked task, use `chalk start <id>` and run finish again. The command prints
verification and review durations, completion-check duration and local receipt paths.
It cannot be combined with queue controls `--max` or `--until`.

This extends the existing single-process driver; it is **not cross-command verification
reuse**. Separate `chalk verify`, `chalk review` and `chalk done` commands still work,
and `done` still verifies. Full identity for external SDKs, dependency installations
and relevant environment inputs remains future work. Where those can change during
review, use `--force-rerun`. Finish does not merge, deploy, publish a release or claim
device QA; an existing task PR retains the driver's existing review-posting behavior.

## Review attachment

`chalk review` automatically supplies a bounded summary of the newest local receipt
matching the review's canonical worktree and task. It compares current source,
that task's criteria and visible locked files, and effective gate configuration.
Review history and unrelated protocol bookkeeping do not change those comparisons.
No configured verification command runs just to construct the attachment.

The summary labels missing, malformed, stale, unknown or incomplete evidence. A
newer unreadable receipt makes selection uncertain; Chalk does not silently choose
an older successful result. A run directory with no readable receipt metadata has
unknown age and keeps selection uncertain. Linked or wrong-type run entries are
also uncertain; their targets are never followed to select a receipt.
Completed receipts must contain the
configured gate outcomes and expected browser executions, with command timing,
exit status, stream metadata and log references; missing execution metadata is
malformed evidence. A current receipt can describe failed verification:
`recordedGreen` and command outcomes remain separate from input freshness.
Other tasks' and worktrees' receipts are never presented as current evidence.

Reviewers receive command outcomes, timestamps, recorded Node/platform identity,
and local stdout/stderr references. The attachment checks archive availability,
not retained byte integrity. It never embeds raw logs or protected regression
output. Receipt files have a 16 MiB read limit; the prompt section has a 16,000
character limit and shows at most eight commands, disclosing omitted commands.
Untrusted strings are JSON-encoded and cannot terminate the section's code fence.

This is supplied host evidence, not independently executed reviewer testing or an
attestation. The reviewer still examines the full contract and reruns checks where
possible. Source/spec/config freshness does not establish complete SDK/environment
identity. This attachment changes no completion gate, and `done` still verifies.

### PR handoff

New PR descriptions use the same receipt selection and freshness checks as reviews.
Both show each command's recorded start, finish and elapsed milliseconds, plus the
recorded source fingerprint. Accepted time values are normalized to UTC ISO timestamps;
comments embedded in date strings are not published. A command that finished successfully can be shown as
passed while its overall receipt remains incomplete. Running commands have no
completed duration. This does not repair an interrupted receipt or certify that its
final integrity and observation checks finished.

The PR projection includes command labels, outcomes, exit codes, timings and freshness,
but omits command strings, local paths, environment values and raw output. It is limited
to eight commands and 8,000 characters; omissions are explicit. The test-plan template
asks for verification rather than claiming GREEN without evidence. Existing PR bodies
are not rewritten by this change. The summary is informational: safe verification reuse
and complete external toolchain identity remain separate work.

## Coverage and adoption

Existing projects adopt recording and review attachment by using the updated CLI;
no new protocol setting or migration is required. Configure the real commands in
`protocol.verify`, prepare stable ignored output directories, and run `chalk verify`
(or `node bin/chalk.mjs verify` from a Chalk source checkout). The emitted receipt
path is local to the invoking workstation. Open that `run.json` for command outcomes
and its referenced stdout/stderr files for actual output. Held-out command output
is withheld and is never included in these receipts or structured status events.

CLI `verify` and the verification performed by `done` append a local update with a
`verification` object. `audit` appends an `audit` object and saves the same scope in
`regression.lastAudit.coverage`. These additive fields distinguish passed, failed,
deferred, unconfigured, stale and unknown checks. `outcome` retains the check's
result when stale input identity prevents treating its pass as current. Counts
refer to executed toolchain commands and browser specification replays, not test
assertions or coverage percentages. Visible test integrity is reported separately;
an interrupted setup does not establish that integrity checking completed.
If a later browser replay cannot start, retained earlier command executions remain
in the report with unknown freshness. Their `scope: "command"` outcome does not
claim a browser specification verdict; completed specification results use
`scope: "specification"`. Partial recovery never makes the failed run GREEN.
Events contain status metadata and receipt IDs, without raw command output or
environment values. They are local bookkeeping, not telemetry.

Verification GREEN describes verification only. Review and release admission are
separate gates. A deferred-only or entirely unconfigured run explicitly says no
executable checks ran, even if its integrity checks pass. An audit keeps phase
verification and held-out execution as separate outcomes. No configured held-out
command means no independent regression coverage. A command's successful exit and
a locked-file count do not measure assertion coverage or prove author independence.
Historical audit records without these fields have unknown scope; their GREEN
value alone must not be interpreted as independent regression coverage.

Retained receipts and archives stay under `.chalk/local/verification/`; Chalk does
not automatically prune them or commit/upload them. Remove only completed runs you
no longer need while verification and review are idle. Removing a run also removes
its local review context. Leave active runs and recovery storage intact; use a fresh
`chalk verify` to collect new evidence. Malformed or unreadable candidate entries can
make review selection uncertain. Full logs may contain anything the configured
commands print, so choose access and retention appropriate for that project.

The source manifest covers the boundaries described above, including configured
source exclusions. It does not establish complete SDK, installed dependency or
environment identity. The reviewer preflight and protected execution path remain
separate work; `done` continues to rerun verification rather than reuse a receipt.

Review is read-only for the whole workspace, including protocol bookkeeping and
ignored artifacts. `chalk verify` records receipts/events, and `chalk audit` also
writes audit state. Reviewers inspect the supplied records or exercise those CLI
workflows in isolated temporary fixtures with separate output paths and without
copying held-out content. Directly rerun only checks that leave the reviewed tree
unchanged. A detected read-only mutation rejects the verdict with its diagnostic
and is not automatically retried as a malformed JSON response.
