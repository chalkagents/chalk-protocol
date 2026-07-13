---
name: chalk-autopilot-setup
description: Ready a chalk-protocol repo for an unattended run — resolve every chalk doctor FAIL/WARN, isolate the held-out set, avoid the vacuous-verify trap, and resume a task that churned past its handoff limit. Load this to set up autopilot, get ready for an unattended run, when chalk doctor fails, or to resume after churn.
---

# chalk-autopilot-setup — readying an unattended run

Before `chalk run` / `chalk pipeline` / `chalk autopilot`, `chalk doctor` must pass. Doctor is
**read-only** — it reports problems but the fixes are all manual. Work the table below top to bottom.

## `chalk doctor` FAIL/WARN → fix

| Symptom | Fix |
|---|---|
| No executor configured | Set `protocol.executor.command` (e.g. `claude -p --agent chalk-executor --permission-mode acceptEdits`). Without it, `chalk run` has nothing to drive. |
| No reviewer / same-model reviewer | Configure `protocol.review.command`. **Avoid a reviewer on the same model family as the executor** — an LLM judging its own model favors it (self-preference bias), so a same-model reviewer + generator fail together. Use a different model for the reviewer. |
| Runnable task has no locked test | Lock a real acceptance test on each runnable task (`chalk spec <id> --test <path>`) so verify isn't vacuous — see `chalk-locked-tests`. |
| Worktree setup missing | Set `protocol.worktree.setup` (the per-worktree bootstrap, e.g. install deps) so parallel/worktree runs start from a working tree. |

Re-run `chalk doctor` until it's green before launching.

## Held-out isolation (P7, #82)

The held-out regression set must be **unreadable by the implementing agent** (implementer blindness).
Two supported layouts:

- **In-repo, gitignored + worktree-hidden** — the default `.chalk/held-out`. A git **worktree** run
  doesn't check out the gitignored dir, so the agent can't see it. Only safe *with* worktree isolation.
- **Outside the repo root** — set `protocol.regression.dir` to an absolute or `~`-prefixed path
  **outside** the checkout. This is how a **manual-mode** run (no worktrees) keeps the set out of
  reach: an agent working in the primary checkout could read a gitignored in-repo dir, but a path
  outside the repo is unreadable. `heldOutBase()` resolves repo-relative vs absolute/`~` accordingly.

Never read or edit anything under the held-out dir yourself — see `chalk-debug-gate` for audit RED.

## The vacuous-verify trap

An **empty** `protocol.verify` prints **GREEN while checking nothing** — a task can sail through P4
having proven nothing. Before queuing tasks, ensure `protocol.verify` has real checks (at minimum a
`test` command). `chalk doctor` flags this; don't launch an unattended run against an empty verify.

## Resuming after churn (handoff)

When a task fails to converge and exceeds `protocol.handoff.maxAttempts` (**default 3**), chalk stops
looping on it and writes a handoff note to `.chalk/handoffs/<id>-N.md` describing what was tried.

To resume: start a **fresh session** (a clean context, not the churned one), read the task with
`chalk context <id>` (and the handoff note), then continue the loop. A fresh session avoids carrying
the failed approach's context forward.

## See also

- `chalk-debug-gate` (#145) — diagnosing the RED verify / review BLOCK / audit RED that stalls a run.
- `chalk-locked-tests` (#144) — locking the acceptance tests doctor asks for.
