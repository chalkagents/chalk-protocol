---
name: chalk-release
description: The chalk release + protected-deploy flow — --commit vs --promote, version semantics and collision probing, the CI-poll knobs, and how to safely resume after an interruption at any step. Load this when you cut a release, promote a release, or a release is stuck mid-run.
---

# chalk-release — releasing & promoting

`chalk release` is the most complex command (orphan recovery, tag-collision handling, and a
multi-step promote choreography). This skill maps the two modes and, critically, how to **resume
safely** when a step failed partway.

```
chalk release [--version x|--major|--minor|--patch] [--commit] [--promote] [--no-tag] [--dry-run]
```

Start with `--dry-run` to see the planned version + steps without changing anything.

## Version selection

- `--major|--minor|--patch` bumps the current version; `--version x.y.z` sets it explicitly.
- Release **probes for a version collision** — if the target tag already exists it will not silently
  clobber it. Pick the next free version (or the correct bump) and re-run.

## `--commit` — cut a release on the current branch

Writes the CHANGELOG + version bump, **commits** that, and tags the commit.

- **Orphan-resume (#125):** if a prior run made the release **commit** but died before the **tag**,
  a re-run detects the orphaned release commit via `git log --grep` at **any depth** (not just HEAD)
  and resumes by tagging it — it does **not** create a second release commit or version-skip. So if
  `--commit` was interrupted, just **re-run the same command**; it finishes the tagging.
- `--no-tag` commits the bump without tagging (e.g. tag later / in CI).

## `--promote` — protected-deploy flow (#98)

For a protected deploy branch you can't push to directly. Requires `protocol.github.deployBase`
configured and **`github.base` ≠ `github.deployBase`** (otherwise there's nothing to promote across).

Choreography — run it on the integration/base branch:

1. Cut the release **commit** on `github.base`.
2. Open a **promotion PR** `base → deployBase`.
3. **Poll CI** on that PR (see knobs below).
4. **Merge the promotion PR with an explicit MERGE commit** — `gh pr merge --merge`, **regardless of
   `github.mergeMethod`** (even if it's `squash`). This is deliberate: the merge commit carries the
   release commit onto the deploy branch so the tag can land on the right tip. Don't expect a squash
   here.
5. **Tag** the deploy branch tip and **push** the tag.

## CI-poll knobs

While polling the promotion PR's checks:

- `protocol.github.ciPollIntervalMs` — wait between polls (default **5000** ms).
- `protocol.github.ciPollAttempts` — max polls before giving up (default **24**) → ~2 min at 5s.
  Set **`0` to never wait** — the release won't poll at all and fails immediately if CI is still
  pending (use only when checks are already green or there are none).

Raise `ciPollAttempts` (or the interval) for slow CI; a timeout here is a *poll* timeout, not a
release failure — the PR is still open and you can re-run to resume.

## Resuming after an interruption (idempotent by step)

Re-running `chalk release` with the **same arguments** is the recovery path — each step detects
what already happened and continues:

- **Interrupted after the commit, before the tag** → re-run; orphan-resume tags the existing commit.
- **`--promote` interrupted after the PR merged, before the tag** → re-run; it fetches the deploy
  tip and tags/pushes without re-opening or double-merging.
- **Poll timed out** → re-run once CI is green; it picks up at the merge/tag step.

Always confirm the end state afterward: `git tag --list` shows the new tag, and the deploy branch
(for `--promote`) points at it.

## See also

- `chalk-ship` (#142) — landing the ordinary feature PRs that accumulate before a release.
