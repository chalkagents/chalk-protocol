# Running Chalk autonomously

An operations runbook for driving a Chalk project with **no human in the loop** — overnight,
in CI, or on a cron. Accurate to the current CLI (`chalk help`).

> **The one rule:** autonomy is only as good as the **locked acceptance tests** you write
> *before* pressing go. Chalk only *implements*; it never authors your tests. A task with no
> locked test makes `verify` pass vacuously — so the executor could do nothing and the gate
> would wave it through. Lock real tests first; the gates do the rest.

---

## Do you even need it?

Usually no. There are two unattended modes, and a live agent session beats both when you're
present.

| Mode | What drives the work | Use when |
|---|---|---|
| **Live (default)** | An agent in a chat hand-drives `next → work → verify → done` | You're collaborating now. The agent *is* the executor. |
| **`chalk run`** | A BYO executor CLI grinds a **pre-specified local backlog** | You want to walk away from a backlog you've already spec'd, on a branch/worktree. |
| **`chalk pipeline`** | The full **GitHub issue→merge** flow, unattended | You want issues to become merged PRs with no human — branch, commit, PR, review, test, squash-merge, cleanup. |

If an agent is already driving live, `chalk run` just spawns *another* agent to do what it
already does. Reach for these only for genuinely unattended runs.

---

## Mode 1 — `chalk run` (local executor loop)

```
chalk run [--until empty|blocked] [--max N] [--dry-run]
```

Each iteration of the loop (`lib/run.mjs`):
1. Pick the next **runnable** task — `specd`, all `--after` deps `done`, not `blocked` (re-read
   every loop, so deps clearing mid-run is picked up).
2. Mark it `in-progress`.
3. **Run the executor** (`protocol.executor.command`) — it gets the task's `chalk context` **on
   stdin** and edits the working tree.
4. **Run `chalk verify`.** ← *the gate decides, not the executor.* The executor's exit code is
   **ignored** (P4 — it can't self-certify).
5. RED → the task is **auto-`blocked`** and the run moves on (or stops, with `--until blocked`).
6. Review due (per `review.requiredAt`) and not passing → auto-`blocked` too.
7. Else → `done`. Loop.

`--dry-run` prints the planned order and changes nothing. `--max N` caps iterations (default 50).
With no executor configured, `run` degrades to printing the manual `next` action.

**Setup** — in `.chalk/chalk.json` → `protocol`:
```jsonc
"executor": { "command": "claude -p" }   // any CLI: reads context on stdin, edits the tree
"review":   { "command": "claude -p", "requiredAt": "milestone-boundary" }  // optional
```

**Workflow**
```bash
chalk task add "sync: wire live Firebase" --milestone sync --after <id>
chalk spec <id> --criterion "..." --test test/.../foo_test.dart   # LOCK A REAL TEST
chalk block <id> --needs creds --reason "needs flutterfire configure"  # park human-needed work
chalk run --dry-run            # sanity-check the order
chalk run --until blocked      # drive until done or genuinely blocked
chalk status                   # see what each blocked task needs, then unblock + re-run
```

---

## Mode 2 — `chalk pipeline` (GitHub issue→merge, unattended)

```
chalk pipeline [--max N] [--dry-run]
```

Walks **every issue-backed task** through a resumable stage machine, one stage per step:

```
issue pull → branch (+worktree) → work → commit → pr → review → evidence → merge → cleanup
```

- `chalk issue pull` imports open GitHub issues as tasks (criteria from `- [ ]` checklist lines;
  branch type from labels via `protocol.github.labelType`).
- Each task gets a `<type>/<issue>-<slug>` branch in its own **git worktree**; the executor and
  gates run **inside the worktree**.
- `commit` is conventional + specific-path (never the spine, `Closes #<issue>`); `pr` opens a PR
  with a Summary/Changes/Test-plan body; `evidence` attaches test screenshots to the PR as
  **immutable commit-SHA blob URLs** (they survive squash-merge + branch deletion).
- `merge` is **gated** — `gh pr merge --squash --delete-branch` only when verify is green ∧ (if
  required) review passed ∧ (if required) held-out audit is green. Then the worktree + branch are
  torn down and the task is `done`.

**The gates are the only safety.** There is no human approval step and no `--force` anywhere. Any
stage that fails a gate **auto-blocks that task** (`needs: human-input`) and the driver continues
to the next issue. It's resumable — re-running picks up from each task's `pipeline.stage`. `--max`
is the seatbelt; `--dry-run` plans without acting.

**Setup** — `.chalk/chalk.json` → `protocol`:
```jsonc
"executor": { "command": "claude -p" },
"github":   { "command": "gh", "base": "main", "mergeMethod": "squash",
              "labelType": { "bug": "fix", "enhancement": "feat", "documentation": "docs" } },
"worktree": { "enabled": true, "dir": ".." },
"e2e":      { "command": "npx tsx <chalk-browser>/src/main/cli/run-spec.ts", "runsDir": ".chalk/runs" }
```
`e2e` is optional — set it only if tasks lock `.chalk/tests/*.test.yaml` browser specs (those run
as a real verify gate and produce the screenshots `evidence` attaches).

### Custom agents for the executor & reviewer

Raw `claude -p` works, but a **custom agent** gives the executor and reviewer a tailored, reliable
role — and the executor agent is where you enforce "author a *real* test, keep diffs small, never
weaken locked tests," which is the antidote to the weak-test risk `doctor` warns about. Define them
as Claude Code agents (committed at `.claude/agents/` so every worktree has them) and wire by name:

```jsonc
"executor": { "command": "claude -p --agent chalk-executor --permission-mode acceptEdits" },
"review":   { "command": "claude -p --agent chalk-reviewer", "requiredAt": "per-task" }
```

- **`chalk-executor`** (tools: Read/Edit/Write/Grep/Glob — no Bash, so `acceptEdits` covers
  everything and it can't hang on a permission prompt) edits the worktree to satisfy the criteria
  and authors a focused test. Its exit code is ignored — `verify` decides.
- **`chalk-reviewer`** (read-only tools) receives the change + criteria on stdin and emits ONLY the
  JSON verdict (`{"verdict":"pass"|"block","findings":[…]}`) chalk's review gate parses. It runs
  adversarially — it will block a change that ships without a real test, which is exactly the point.

This makes the unattended loop trustworthy: the executor produces aligned work, and the reviewer is
a genuine P5 gate, not a rubber stamp.

---

## Before you press go

**1. Preflight — `chalk doctor`** (read-only; always safe to run):
```
$ chalk doctor
toolchain
  ✓ git on PATH
  ✓ gh on PATH
  ✓ inside a git work tree
github
  ✓ repo your-org/your-repo
  ✓ gh authenticated
  ✓ base branch origin/main exists
executor
  ✗ no protocol.executor.command — the loop cannot write code
...
● NOT READY — 1 blocker(s)
```
It fails on anything that would make a run unsafe or vacuous — missing executor, unauthenticated
`gh`, and most importantly **a runnable task with no locked test**. Get to `● READY` first.

**2. Smoke — `chalk smoke` on a SCRATCH repo** (the only command that does real outward-facing
actions):
```bash
chalk smoke --dry-run        # shows the target repo + plan, does nothing
chalk smoke --create --yes   # opens a throwaway issue, drives it issue→merge, verifies the result
```
It runs the *real* pipeline on one throwaway issue, then checks the actual artifacts — task done,
local branch deleted, **PR merged**, issue auto-closed, evidence attached — and prints **GO /
NO-GO**. Point it at a sacrificial repo, not your main project, until you trust it.

---

## Scheduling

Chalk stays a CLI — there's no daemon. But **don't put `chalk pipeline` directly in cron**: use
**`chalk autopilot`**, the safe scheduled-run unit:

```
chalk autopilot [--max N]
```

Each call: takes a **lock** (so overlapping scheduled runs can't stomp each other), runs
**`chalk doctor`** and **aborts if the repo isn't ready** (no executor, `gh` not authed, a testless
task with no reviewer backstop, …), and only then drives **one bounded `chalk pipeline` sweep**. It
self-skips when not ready or already running, so it's safe to fire on any interval.

```bash
# cron — every 30 min, bounded, logged
*/30 * * * *  cd /path/to/repo && /usr/local/bin/chalk autopilot --max 3 >> .chalk/local/autopilot.log 2>&1
```

On macOS a **launchd** agent (`~/Library/LaunchAgents/…`) running the same command on a
`StartInterval` is the more reliable equivalent. For an in-session, watch-and-stop demo, the Claude
Code **`/loop`** harness works too: `/loop 30m chalk autopilot --max 2`.

Either way, the executor/reviewer CLIs (`claude`) and `gh` must be **authenticated in that
environment** — a headless cron won't inherit your interactive login. Run `chalk doctor` once by
hand first; if it's `● READY`, the schedule will be too.

---

## Monitoring & kill switches

- **`chalk status`** / **`chalk backlog`** — current state, what each blocked task needs, the DAG.
- **`chalk log [--n N]`** + `.chalk/updates.jsonl` — the append-only event trail (every start,
  block, done, merge).
- **`--max N`** caps iterations — your seatbelt against a runaway loop.
- **To stop:** there's no daemon to kill — each `chalk run`/`pipeline` invocation is finite. To
  pause a specific task, `chalk block <id>`; to resume, `chalk unblock <id>` then re-run.
- **Blocked ≠ broken:** a blocked task is the harness telling you a human is genuinely needed
  (creds, a decision, an upstream dep). Supply it and re-run.

---

## Safety model & caveats

- **Gates only.** Locked tests (P2/P6) + `verify` (P4) + optional adversarial review (P5) +
  optional held-out audit (P7) are the entire steering mechanism. Weak tests → weak autonomy.
- **No mid-run steering of direction** — by design. You steer by what you lock *before* the run.
- **Spine stays in the primary checkout.** Feature branches commit only code + `.chalk/evidence/`,
  never spine state (`tasks.json`/`chalk.json`), so squash-merges never touch it.
- **Issue content is quoted** — labels/titles/bodies flow into `gh`/`git` shell-safely (no
  injection), but still only point unattended runs at repos you trust.
- **Cost & latency:** one executor (sub-agent) invocation per task; a big backlog = many calls.
- **Run on a branch or worktree.** `chalk run` edits your tree in place; `chalk pipeline` isolates
  each task in its own worktree.
