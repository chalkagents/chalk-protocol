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
SDK, dependency installation or relevant environment input. Automatic review
attachment, reviewer toolchain preflight and safe reuse by `done` are subsequent
work. `done` continues to run verification. Within a run, changes to task/config
authority files conservatively invalidate the result, including unrelated concurrent
bookkeeping; later reuse must compare the relevant semantic inputs instead.
