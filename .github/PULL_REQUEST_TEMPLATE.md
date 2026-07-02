# What & why

<!-- One paragraph: the problem, and how this change solves it. Link the issue if one exists. -->

## Checklist

- [ ] `node --test` is green locally (zero dependencies — no install step needed)
- [ ] New behavior ships a test that **fails without the change** (chalk's own break-it rule)
- [ ] Locked test files under existing tasks are untouched (or the change goes through `chalk amend-spec` with a reason)
- [ ] Diff is small and scoped to one concern

## How this was built

<!-- If you used the chalk loop (chalk task add → spec → verify → review → done), say so — it's the
     native path (see CONTRIBUTING.md). A plain PR is fine too; the gates run in CI either way. -->
