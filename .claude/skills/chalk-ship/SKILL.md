---
name: chalk-ship
description: How to push branches and land PRs safely in chalk-protocol — the single-PR squash path, and the stacked-PR --delete-branch trap with the exact bottom-up merge procedure. Load this whenever you push, open a PR, or land/merge work.
---

# chalk-ship — pushing & landing PRs

Load this before you push a branch or merge a PR. The stacked-PR trap here is sharp and has
already auto-closed PRs and cost real rework. See `chalk-commit` for what to verify is committed
*before* you get here.

## Branch naming

`<type>/<issue>-<slug>` — e.g. `docs/142-chalk-ship`, `fix/151-diffless-review`. The pipeline's
`chalk branch` produces exactly this.

## Pre-merge check (always)

Before merging, confirm the change is actually committed — `chalk commit` no-ops after the first
commit (#134), so a review-fix can sit uncommitted and get squash-merged away:

```
git status                 # working tree clean
git show --stat HEAD       # your files are actually in HEAD
```

Also confirm the PR is green and mergeable:

```
gh pr view <n> --json mergeable,mergeStateStatus,statusCheckRollup
```

## Single-PR path (the common case)

When nothing else stacks on your branch, a plain **squash-merge** is correct and tidy:

```
gh pr merge <n> --squash --delete-branch
```

Squash collapses the branch to one commit on the base and deletes the merged branch. Safe **only**
because no other open PR uses this branch as its base.

## Stacked PRs — the `--delete-branch` trap

**Never `gh pr merge --delete-branch` a PR whose head branch is the BASE of another open PR.**
Deleting that branch **auto-CLOSES the child PR**, and a closed PR whose base branch is gone
**cannot be reopened or rebased** — you must recreate it from scratch.

### Landing a stack A ← B ← C, bottom-up

`A` targets `main`; `B` targets `A`; `C` targets `B`.

1. **Merge A without deleting its branch.** Use `--merge` (not `--squash`) so the shared commits
   are preserved and B/C stay mergeable:
   ```
   gh pr merge A --merge          # NO --delete-branch
   ```
2. **Retarget B to the base, then merge it** (GitHub does **not** reliably auto-retarget children):
   ```
   gh pr edit B --base main
   gh pr view B --json mergeable  # confirm MERGEABLE before merging
   gh pr merge B --merge          # NO --delete-branch
   ```
3. **Repeat for C** (`gh pr edit C --base main`, confirm `MERGEABLE`, `gh pr merge C --merge`).
4. **Delete all merged branches at the very end**, once nothing targets them:
   ```
   git push origin --delete <branchA> <branchB> <branchC>
   ```

Rules of thumb for a stack:
- Retarget each child **explicitly** before merging it — don't trust auto-retarget.
- Prefer `--merge` over `--squash` while children still depend on the shared ancestry.
- Delete branches **last**, never mid-stack.

## See also

- `chalk-commit` (#141) — commit discipline; the #134 no-op hazard the pre-merge check guards against.
- `chalk-branch-cleanup` (#143) — pruning the branches safely after everything has landed.
