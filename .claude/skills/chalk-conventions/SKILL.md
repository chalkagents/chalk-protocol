---
name: chalk-conventions
description: The conventions every Chalk Protocol agent must follow — conventional commits, branch naming, the locked-test discipline, small scoped diffs, and the do-not-self-certify rule. Load this when planning, implementing, or reviewing a Chalk task.
---

# Chalk Protocol conventions

Follow these whenever you plan, implement, or review a task in this repo.

## The contract
- **Acceptance criteria are the contract.** Make every criterion pass — no more, no less.
- **Author a real test.** Write a focused test that would FAIL without the change and pass with it.
  A placeholder or a test that asserts nothing defeats the entire harness. The adversarial reviewer
  will block a change shipped without a genuine test.
- **Never touch a locked / at-risk test.** Files listed as locked are read-only. Do not edit, weaken,
  delete, rename, or route around them. The only sanctioned change is `chalk amend-spec`.
- **Don't self-certify.** Don't run git, open PRs, or declare yourself done — the `verify` gate (and
  the reviewer) decide. Just make the change and stop.

## Diffs
- Keep the diff **small and scoped strictly to the task.** No drive-by refactors, dependency bumps,
  or reformatting of files you didn't have to change.
- **Reuse existing utilities** over writing new code. Check `lib/*` first (see the chalk-codebase skill).
- Match the surrounding code's style, comment density, and idioms.

## Commits & branches (when the pipeline commits for you)
- Conventional commits: `<type>(<scope>): <description>` — imperative, lowercase, ≤70 chars, no period.
  Types: feat, fix, refactor, chore, docs, style, perf, test, build, ci.
- Branches: `<type>/<issue>-<slug>`.
- **Never** add a `Co-Authored-By` trailer. **Never** double a conventional prefix the title already has.
- Link the issue with `Closes #<n>` in the commit body.

## Lessons
- Read the **Lessons learned** section in your context and honor it — it's the accumulated memory of
  mistakes this loop has already made. Don't repeat them.
