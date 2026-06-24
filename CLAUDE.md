<!-- chalk:begin (managed by `chalk agents` — edits inside are overwritten) -->
## Chalk Protocol — how to work in this repo

This project is driven by **Chalk Protocol**. Your job is to satisfy a locked spec, not to
declare victory. Use the `chalk` CLI as your loop. Run `chalk next` anytime to get your
next action.

**The loop (per task): read → work → verify → write.**

1. `chalk next` — find the one task to work on. Work on **ONE task at a time**.
2. `chalk context <id>` — read the acceptance criteria and the at-risk tests BEFORE coding.
   Do not work from memory.
3. `chalk start <id>` — begins the task. It refuses if the task has no acceptance criteria.
4. Write code to satisfy the criteria.
5. `chalk verify` — runs the real toolchain + a test-integrity check. Loop until it prints
   GREEN. **Do not self-declare success** — the gate decides, not you.
6. If review is required, `chalk review <id>` — an adversarial reviewer tries to refute your
   change. Fix every blocking finding and re-run until it passes. A green verify does NOT
   excuse an inadequate test or an unmet criterion.
7. `chalk done <id>` — only succeeds when verify is green, the locked tests are untouched,
   and (if required) the review passed.
8. Record what changed: `chalk decision "..." --why "..."`, `chalk update "..."`,
   `chalk question add "..."` for anything needing a human.

**Hard rules**
- Files listed under a task's tests are **READ-ONLY**. Do not edit, weaken, or delete them
  to make verify pass. To legitimately change a test, use
  `chalk amend-spec <id> --test <path> --why "..."` — that is the only sanctioned path.
- Never mark a task done by editing `.chalk/tasks.json` directly. Use `chalk done`.
- **Never read or edit anything under `.chalk/held-out/`** — the held-out regression set. If
  `chalk audit` reports a held-out failure, you are told only THAT a criterion regressed, not
  the assertion. Fix the bug against the spec; do not inspect or target the hidden tests.
- At phase boundaries run `chalk audit` — it must be green to advance.
- Keep diffs small and scoped to the current task.
<!-- chalk:end -->
