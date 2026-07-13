---
name: chalk-locked-tests
description: The locked-test lifecycle in chalk-protocol — author a fail-first test, sha256-pin it with chalk spec --test, commit the lock in the same change, and use chalk amend-spec (the only sanctioned way to change a locked test, which stales prior reviews). Load this whenever you lock a test, amend a spec, or deal with test integrity.
---

# chalk-locked-tests — pin & amend discipline

Locked tests are the harness's teeth: they are sha256-pinned so an agent can't quietly weaken the
contract it's being held to. This is the sharpest, most-cited friction area in the repo — get the
lifecycle right. See `chalk-conventions` for the read-only rule this skill operationalizes.

## Create → pin → commit (one atomic change)

1. **Author fail-first.** Write a focused test that **FAILS without the change and passes with it**.
   A placeholder or a test that asserts nothing defeats the entire harness — the adversarial
   reviewer blocks it.
2. **Put the real assertion in the file you'll lock.** For CLI-wiring / e2e acceptance criteria, the
   asserting test must live in the **locked** file, not only in an editable sibling suite — otherwise
   the locked file is a vacuous pin and the wiring can be reverted undetected.
3. **Pin it** — `chalk spec <id> --test <path>` records a sha256 lock of the file:
   ```
   chalk spec <id> --test test/my-feature.test.mjs
   ```
4. **Commit the lock in the SAME change that creates it.** An **untracked** locked test ships a
   **vacuous green** — CI has nothing to run, and the tracking gate (#107/#113) exists precisely
   because this bit three reviews in a row. `git add` the test file and commit it with the change.

## Locked files are read-only

Once pinned, **never edit, weaken, delete, or rename a locked file directly.** The integrity gate
(P6) recomputes the sha256 and blocks `done`/`verify` if the file drifted from its lock.

## Changing a locked test — `chalk amend-spec` is the only door

When a locked test genuinely must change (the spec evolved), the **only** sanctioned path is:

```
chalk amend-spec <id> --test <path> --why "why the contract changed"
```

Two consequences to plan around:

- **It stales any prior passing review.** Amending re-opens the contract, so a **fresh** `chalk review`
  is required before you can `chalk done` — a review that passed against the old test no longer counts.
- **Amend only AFTER the suite is green.** Re-locking a file while its test is red forces a second
  amendment once you fix it (you'd be pinning a failing state). Make `node --test` green first, then
  amend to re-pin the final file.

## Quick reference

| You want to…                        | Do                                                        |
|-------------------------------------|-----------------------------------------------------------|
| Lock a new test                     | `chalk spec <id> --test <path>` + commit it same change   |
| Legitimately change a locked test   | `chalk amend-spec <id> --test <path> --why "…"` (green first) |
| Edit a locked file directly         | **Don't** — P6 will block; use `amend-spec`               |

## See also

- `chalk-conventions` — the author-a-real-test and never-touch-a-locked-test rules.
- `chalk-debug-gate` (#145) — what to do when P6 integrity or a review blocks you.
