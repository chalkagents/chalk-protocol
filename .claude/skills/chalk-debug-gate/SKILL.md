---
name: chalk-debug-gate
description: Diagnose a failing chalk gate — RED verify, a review BLOCK, an audit RED (P7), or a refused chalk done. A symptom→gate→remediation decision tree. Load this when verify is red, a review is blocked, an audit failed, or you cant mark a task done.
---

# chalk-debug-gate — diagnosing a blocked gate

When a gate stops you, the cause varies and the surfaced output is terse (the verify tail
truncates; the audit is blind by design). Use the decision tree below: identify **which gate**
fired, then apply its remediation.

## Decision tree

### 1. `chalk verify` is RED (P4 toolchain / P6 integrity)

Re-run `chalk verify` and read the **full** toolchain output, not just the truncated tail — the
real error is often above the last ~12 lines. Then distinguish:

- **Toolchain failure** — a real `node --test` / typecheck / lint / build failure. Fix the code so
  the command exits 0. Run the failing command directly for the complete output.
- **Test-integrity VIOLATED** (P6) — a **locked** test file drifted from its sha256 pin (you edited,
  renamed, or deleted it). Restore the file. If the test genuinely must change, use
  `chalk amend-spec` — see `chalk-locked-tests`. Never route around the pin.
- **e2e failure** — a configured e2e spec failed. Run it directly and fix the behavior.

### 2. `chalk review` is a BLOCK (P5) — **this is yours to fix**

A review BLOCK is **agent-owned** work, **not** a human dependency. Do **not** `chalk block --needs`
it away. Instead:

1. Read every blocking finding; fix the code/test to address it.
2. **Commit the fix MANUALLY** — `chalk commit` no-ops after the first commit (#134), so a
   review-fix left to `chalk commit` never lands. `git add … && git commit` (see `chalk-commit`).
3. Re-run `chalk review <id>`.
4. When it passes, `chalk unblock <id>` clears the `needs: review` block (#117), then `chalk done`.

### 3. `chalk audit` is RED (P7 held-out regression)

The audit tells you **only THAT a criterion regressed — never the hidden assertion.** This is by
design (implementer blindness):

- **Fix the bug against the spec/acceptance criteria**, not against the test.
- **Never read or edit anything under `.chalk/held-out/`.** Inspecting or targeting the hidden set
  defeats the regression guarantee.

### 4. `chalk done` refuses

`done` opens only when P4 + P6 + P5 all pass. Map the refusal:

- "verify not green" → go to **(1)**.
- "locked tests changed" / integrity → **(1)**, the P6 branch.
- "review required / not passed" → **(2)**.

Fix the named gate and re-run `chalk done`.

## See also

- `chalk-locked-tests` (#144) — P6 integrity and the amend-spec path.
- `chalk-commit` (#141) — the manual-commit-after-review rule step (2) depends on.
