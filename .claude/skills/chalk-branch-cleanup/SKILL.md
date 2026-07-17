---
name: chalk-branch-cleanup
description: Safely prune stale local and remote branches in chalk-protocol — why git branch --merged lies here (squash merges), how to verify PR state via gh before deleting, and the unmerged-commit safety check. Load this whenever you clean up branches.
---

# chalk-branch-cleanup — pruning branches safely

Load this before deleting any branch. Deleting an unmerged branch loses work, and this repo's
**squash-merge** workflow makes the usual "is it merged?" check lie. See `chalk-ship` for the
merge side of the lifecycle.

## The one caveat that matters: `git branch --merged` LIES here

This repo **squash-merges** PRs. A squash merge creates a brand-new commit on the base, so the
feature branch's commits are **never ancestors** of `main`/`dev`. That means:

> **`git branch --merged origin/main` will NOT list your merged feature branches.** Trusting it
> makes merged branches look unmerged (annoying) — but the real danger is the inverse mistake:
> force-deleting a branch you *assumed* was unmerged.

**Verify each branch's PR state via `gh` — that is the source of truth, not ancestry:**

```
gh pr list --head <branch> --state all --json number,state
# delete ONLY when state == "MERGED"
```

## The routine

1. **Prune stale tracking refs** for branches already deleted on the remote:
   ```
   git fetch --prune
   ```
2. **Find local branches whose upstream is gone** (candidates for deletion):
   ```
   git branch -vv | grep ': gone]'
   ```
3. **Verify each candidate's PR is MERGED** (see above), then delete:
   - Local (force `-D`, because squash-merged branches are not ancestors so `-d` refuses):
     ```
     git branch -D <branch>
     ```
   - Remote merged branches:
     ```
     git push origin --delete <branch> [<branch> ...]
     ```
4. **Resync `main`** when it has drifted behind the remote:
   ```
   git fetch origin main && git branch -f main origin/main   # only if main isn't checked out
   ```

## Safety rule (do NOT skip)

**Never delete a branch whose PR is OPEN or has no PR** without first checking for unmerged commits:

```
git log origin/main..<branch> --oneline   # any output = unmerged work; do NOT delete
```

If that range is non-empty, the branch carries commits that never landed — deleting it (especially
`-D`) loses them. Land or explicitly abandon the work first.

## See also

- `chalk-ship` (#142) — the merge/landing procedure that produces these merged branches.
