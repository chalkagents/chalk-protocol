# Deterministic review inputs

Chalk pins the current commit when `chalk start` begins a task. `chalk branch`
records the actual checkout's starting commit, including when reusing an existing
branch, and `chalk run` pins before execution. Restarting
a task preserves its base. A task started before the repository's first commit has
an explicit empty-tree base.

`chalk review <id>` shows the actual execution directory, branch, task base, HEAD,
content fingerprint, complete changed-file list and untracked files before invoking
the reviewer. One base-relative diff includes committed, staged and unstaged changes.
Non-ignored untracked files are included automatically, including new test files.
Chalk spine state (including archived task history) and protected regression content are excluded; visible contract
artifacts remain included. All visible changes are candidates: remove unrelated work
from the task workspace before reviewing. Locked-test tracking requirements at the
completion gate still apply.
Protected directories are excluded by both their configured paths and resolved
symlink targets. A protected directory covering the entire workspace, or a tracked
input beneath a symlinked parent directory, causes refusal before diff capture.

For a task that predates base recording, Chalk can use a unique merge base with the
configured base branch. If local and remote histories produce different bases, or no
base resolves, review refuses before invoking the reviewer. A successfully resolved
legacy base is persisted before review, so later branch movement cannot change it.
For existing committed
work, choose its actual starting commit explicitly:

```sh
chalk review <task-id> --base <task-start-commit>
```

The ref resolves to an immutable commit and is saved on the task. It must be an
ancestor of HEAD. Ambiguous names, including a branch and tag with the same name,
are refused even when Git warnings are disabled. Use a qualified `refs/heads/...`
or `refs/tags/...` name, or a full commit ID. Choosing a new base invalidates prior review approval. An empty
candidate stays empty: Chalk never substitutes the previous commit or the whole
repository merely to obtain a diff. Resolve merge conflicts before review, including
conflicts outside the project subdirectory or in excluded metadata. This check reads
index conflict entries without reading protected file contents. Index flags
that can hide modified files (assume-unchanged, skip-worktree or fsmonitor-valid)
also cause a preflight refusal; clear the reported flags before retrying. When a file
has both staged and unstaged edits, stage its intended full contents or unstage the
partial version before review. Git submodule review inputs are currently unsupported
and are refused; use a task rooted in the submodule repository for its own changes.

Git replacement refs are ignored consistently when resolving and comparing review
revisions. Executable-bit changes are captured even when `core.filemode=false`.
Clean filters, working-tree encoding conversion and ident expansion are
unsupported and refused before diff capture: they can remove effective source from
Git's diff. CRLF files subject to Git line-ending normalization are also refused;
normalize those working files before review. Ordinary LF text attributes remain
supported. These checks include tracked files Git otherwise reports as unchanged.

Chalk runtime records and its transaction locks are excluded from the candidate.
The accepted verdict records the input manifest and fingerprints for both the
presented revision and effective file contents. Approval admission revalidates this
candidate, including ambiguous index or submodule inputs introduced after a PASS.
Staging or committing identical reviewed bytes preserves the candidate identity.
These identify
what was presented; a fingerprint does not prove that tests executed. Verification
evidence remains separately labelled, and source observation and the full
adversarial rubric remain active. Outside Git, review retains explicit source
inspection mode without claiming a Git revision.

This makes execution location visible. Explicit worktree attachment and isolated
reviewer test execution are separate follow-ups; this change does not redirect
commands invoked from an unregistered worktree.
