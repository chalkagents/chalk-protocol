---
name: chalk-commit
description: Uniform commit discipline for chalk-protocol — conventional-commit format, the chore(spine): reconcile pattern, the chalk commit no-op hazard, the manual-commit-after-review checklist, and the Co-Authored-By policy. Load this whenever you commit or save changes in this repo.
---

# chalk-commit — commit discipline

Load this before committing anything in chalk-protocol. It captures the format **and** the
hazards that have already cost real work here. See `chalk-conventions` for the broader
contract (locked tests, scoped diffs, do-not-self-certify) — this skill is the commit-only
deep dive.

## Conventional commits

`<type>(<scope>): <description>`

- **Imperative, lowercase, ≤70 chars, no trailing period.** "add X", not "Added X." / "Adds X".
- **Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`, `test`, `build`, `ci`.
- Scope is optional but useful (`feat(feedback):`, `fix(review):`, `chore(spine):`).
- **Never double a prefix** the title already carries (a task titled `docs(skills): …` becomes
  a commit `docs(skills): …`, not `docs: docs(skills): …`).
- **Link the issue** with `Closes #<n>` in the body when the commit lands issue-backed work — the
  merge auto-closes the issue and keeps the PR record honest.

## The `chore(spine):` reconcile pattern

Chalk writes project state into `.chalk/` (tasks.json, board, decisions.md, updates.jsonl, plan
files). When those change on their own — a task moved to `done`, an out-of-band merge left the
spine stale, issue intake added new task rows — commit them **separately** with a `chore(spine):`
title, not bundled into feature work.

- Issue-intake metadata (new task specs, board rows) → its **own** `chore(spine):` commit **before**
  starting feature work, so `.chalk/tasks.json` noise never pollutes the scoped feature diff (the
  adversarial reviewer flags mixed-in spine churn).
- Reconciling the spine after an out-of-band merge → `chore(spine): sync …`.

```
chore(spine): sync done records for the last merged batch

Feedback nudge (#155), pull-count unification, reviewer origin-base diff.
```

## The `chalk commit` no-op hazard (#134)

`chalk commit` guards on the task's `committed` pipeline stage and **returns "already done" after
the first commit**. So any change you make to address a **review BLOCK** — which happens *after*
that first commit — is **NOT** re-committed by `chalk commit`. It stays in the working tree and
gets squash-merged away. This shipped #114 half-incomplete.

**Rule: after addressing a review block, commit the fix MANUALLY.**

Manual-commit-after-review checklist:

1. `git add <the files you changed>`
2. `git commit` with a conventional message (see the Co-Authored-By policy below).
3. `git status` → confirm the working tree is **clean** (nothing left unstaged).
4. `git show --stat HEAD` → confirm your review-fix files are actually **in** the commit.
5. Only then `chalk merge` — never merge on the assumption `chalk commit` re-committed for you.

## Co-Authored-By policy

Two commit paths, opposite rules — do not cross them:

- **Pipeline-agent commits** (what the executor/reviewer/`chalk commit` produce): **NEVER** add a
  `Co-Authored-By` trailer. The `chalk-conventions` skill enforces this for pipeline-side commits.
- **Human / main-loop commits** (you committing manually — review fixes, `chore(spine):` syncs,
  direct maintainer work): **DO** add the trailer:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

If you're unsure which path you're on: if you ran `git commit` yourself, it's a main-loop commit
and the trailer applies; if `chalk` committed for you inside the pipeline, it must be omitted.

## Concrete example (a manual review-fix commit)

```
fix(review): prefer origin/<base> over the local base in captureDiff

A stale local dev branch ballooned the review diff to the whole branch history.
Closes #<n>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

## See also

- `chalk-conventions` — the full contract; its commit section covers only the pipeline side.
- `chalk-ship` (#142) — landing the resulting PR safely (the stacked-PR `--delete-branch` trap).
- `chalk-dogfood` (#148) — where the spine-first and commit-manually rules fit in the loop.
