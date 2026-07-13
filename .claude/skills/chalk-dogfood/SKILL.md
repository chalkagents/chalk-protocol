---
name: chalk-dogfood
description: How to contribute to chalk-protocol via chalk itself — the self-hosting loop, the pipeline vs hand-committing rule, and the ordering gotchas (spine-first, commit-manually-after-review, lock-in-same-change, reconcile after out-of-band merges). Load this to contribute to chalk, dogfood, or run the loop on chalk itself.
---

# chalk-dogfood — contributing to chalk via chalk

Chalk is self-hosting: the intended way to change it is to run chalk's own loop on it. The rules
below are scattered across `CONTRIBUTING.md` and several lessons — getting the **ordering** wrong
creates review noise or loses work. See `chalk-commit` and `chalk-ship` for the commit/land details.

## Issue-backed tasks go through the GitHub pipeline

A task with a GitHub issue flows through the pipeline, not a direct commit to the integration branch:

```
chalk branch <id> → work → commit → pr → review → merge
```

**Hand-committing to `main`/`dev` skips the PR record** and leaves the task's pipeline stages stale.
Let the merge gate (CI + review) decide the landing — that's the whole point of dogfooding the gate.

## The ordering gotchas (in order)

1. **Spine-first: intake in its own `chore(spine):` commit BEFORE feature work.** After `chalk issue
   pull` or any `.chalk/` intake (new task specs, board rows), commit **only** the `.chalk/` metadata
   as a separate `chore(spine):` commit *before* you start editing code. Otherwise `.chalk/tasks.json`
   churn rides along in the feature diff and the adversarial reviewer flags the unrelated noise.

2. **Lock in the same change.** Commit a sha256-pinned locked test in the **same** change that
   creates it — an untracked locked test ships a vacuous green (see `chalk-locked-tests`).

3. **Commit review-fix changes MANUALLY.** `chalk commit` no-ops after the first commit (#134), so a
   fix you make to clear a review BLOCK never gets committed by it. `git add … && git commit`
   yourself, then **verify before `chalk merge`**:
   ```
   git status               # clean
   git show --stat HEAD     # your fix files are in HEAD
   ```

4. **Reconcile the spine after out-of-band merges.** When work lands on the remote outside your local
   loop (a PR merged elsewhere, a squash), your local `.chalk/` drifts. Reconcile it with a
   `chore(spine): sync …` commit rather than bundling the drift into the next feature diff.

## The loop, end to end

`chalk next` → `chalk context <id>` → `chalk start <id>` → work → `chalk verify` (green) →
`chalk review <id>` (fix + re-run until it passes) → `chalk done <id>` → record with
`chalk decision`/`chalk update`. For unattended runs, `chalk pipeline` / `chalk run` drive it.

## See also

- `chalk-commit` (#141) — the `chore(spine):` pattern and the manual-commit-after-review checklist.
- `chalk-ship` (#142) — landing the resulting PRs (and the stacked-PR trap).
- `chalk-locked-tests` (#144) — the lock-in-the-same-change rule.
