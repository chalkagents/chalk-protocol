# `.chalk/chalk.json` — the full `protocol.*` reference

Everything chalk does is configured here. Two rules cover most of it: **every agent is a BYO shell
command** (reads its input on stdin, prints its result on stdout; empty command = stage OFF), and
**gate commands are your real toolchain** (chalk never fakes a check it can't run).

A test (`test/docs.test.mjs`) pins this file to `initSpine()` down to the NESTED keys: every key
below exists in the default config, every default-config key has a section below, and each
section's `{ … }` key list names exactly the nested keys the default config carries — the
reference cannot drift from the config it documents, at any level.

### `version`

Protocol identifier (`chalk/0`). Written by init; not user-edited.

### `phase`

Current project phase: `discovery | spec | design | build | review | ship`. Advanced by
`chalk phase <p>` — which is GATED (P7): a required held-out audit must be green & fresh.

### `status`

Project status marker (`active`). Informational.

### `runner`

Optional SDK prefix prepended to every gate command (e.g. `"fvm"` → `fvm flutter test`).
Idempotent — a command already starting with it isn't double-prefixed. Default `""`.

### `verify`

The P4 toolchain gates, `{ test, typecheck, lint, build }` — each a command string or
`{ cmd, when }` where `when: "phase"` defers a slow gate (full build) to `chalk audit` instead of
every `chalk verify`. **`verify.test` is the one practically-required key**: with everything empty,
verify prints GREEN with a `⚠ VACUOUS` label. Presets fill this (`chalk init` auto-detects; or
`--preset node|flutter|dart|python|go`, `--verify-test "<cmd>"`).

### `review`

P5, the adversarial reviewer. `{ command, requiredAt }` — `command` reads the review prompt
(criteria + diff + stat) on stdin and prints `{"verdict":"pass"|"block","findings":[...]}`;
`requiredAt` is any of `per-task | milestone-boundary | phase-advance` (legacy `required: true`
= per-task). A blocking verdict stops `done`; override only via `--force-review --why` (logged).
Run it on a **different model family** than the executor — `chalk doctor` warns when they match.

### `regression`

P7, the held-out set the implementing agent NEVER reads. `{ command, authorCommand, dir, required,
tests, locPerTest, lastAudit }`. `chalk audit` runs `command` with output withheld (pass/fail
only); `required: true` gates `chalk phase`. `dir` defaults to `.chalk/held-out` — gitignore it
(doctor FAILS if it's git-tracked; a worktree checkout would leak it). The stringency floor scales
with code size (`locPerTest`, default 2000).

### `planner`

`{ command }` — optional read-only planning agent: task context in → plan text out
(`chalk plan <id>`). Advisory; pairs with `plan.required` for the human checkpoint.

### `plan`

`{ required }` — when true, `chalk work` refuses until a human runs `chalk approve-plan <id>`
(after the planner's scoping questions are answered). Default false.

### `director`

`{ required }` — director mode's alignment checkpoint (#191). When true, `chalk work` refuses until a
human runs `chalk align <id>` to accept the task's acceptance criteria as the definition of *done* —
before any code is built. Where `plan.required` gates the approach, this gates the framing of *done*
(the empty-middle misalignment in #160). Default false.

### `executor`

`{ command }` — the agent that writes code for `chalk run`/`chalk work`/`chalk pipeline`: receives
`chalk context` on stdin, edits the working tree; its exit code is IGNORED — the verify gate
decides. Optional: the manual loop needs none. `chalk init --executor claude|opencode` scaffolds
one (claude also installs the shipped agent definitions into `.claude/agents/`).

### `requireTest`

Lever 1 (default `true`): a feature change must add or change a test file, else `work` blocks —
a vacuously-green verify can't certify an untested feature. Docs/chore branches and `skip-test`
labels are exempt.

### `contextBudget`

Byte budget for the `chalk context` blob piped to the executor (default `65536`). Only the elastic
lessons block is trimmed to fit — the current task's criteria, locked tests, handoff, prior-review
findings, and the contract are always kept. Under pressure the *oldest* lessons are elided first
(recent ones are most relevant) and a note reports how many. Raise it, or run `chalk archive`, if a
large project starts eliding lessons.

### `integrity`

Locked-test integrity scope. `in-progress` (default): `verify` hashes only the current in-progress
tasks' locked tests, so lock protection expires at `done`. `all-locks`: `verify` also hashes every
*done* task's locked tests — closing the cheat where a later task weakens an earlier task's locked
test to keep its own verify green. `chalk amend-spec` stays the only sanctioned way to change a
locked test; the tradeoff is that legitimate evolution of an old task's test then requires an
amend on that task.

### `tamperEvident`

Manual-mode hardening (default `false`). When `true`, chalk records the hashes of its authority
files (`chalk.json`, `tasks.json`) in gitignored `.chalk/local/` after every write; the next
invocation loudly flags — and logs an event for — any change made *outside* chalk (hand-marking a
task done, weakening a verify command). It is tamper-*evidence*, not a lock: after warning it
re-baselines, and a determined editor could rewrite the baseline too. Pairs with
`integrity: all-locks` for teams running in manual mode without worktree isolation.

### `breakTest`

Lever 3, the non-vacuity probe: a per-file command template (`node --test {test}`) used to run
each LOCKED test against the *reverted* implementation — a test that still passes there asserts
nothing and blocks. Presets arm it where a per-file runner is truthful (not go). An unrunnable
probe reports `INCONCLUSIVE` (loud), never a pass. Empty → OFF.

### `mutation`

Lever 3, rigorous: per-file mutation-testing template (`npx stryker run --mutate {file}`) that
must exit non-zero when mutants SURVIVE in changed code. Surviving mutants block `work`
(coverage can be 100% with a near-zero mutation score). Unrunnable → `INCONCLUSIVE`. Empty → OFF.

### `handoff`

`{ command, maxAttempts }` — when a task can't finish (block, churn past `maxAttempts` work
attempts, manual), chalk writes a structured handoff doc for a FRESH session; the optional agent
enriches the narrative (failure warns and falls back to the template). Default maxAttempts 3.

### `prbody`

`{ command }` — optional agent that authors the PR-body narrative for `chalk pr` (structured
template otherwise).

### `github`

The issue→merge pipeline config: `{ command, base, repo, deployBase, mergeMethod, labelType,
ciPollIntervalMs, ciPollAttempts }`. `command` is your `gh` (stubbable in tests); `labelType` maps
issue labels to branch types (`bug→fix`). Merge runs the broke-check: remote CI verdict when the
PR has checks, else local verify (labeled when it falls back). `base` is the integration branch
PRs target; `deployBase` is the protected deploy branch `chalk release --promote` promotes to
(promotion PR merged with a MERGE commit, tag on its tip — set it ≠ `base` to enable).
`ciPollIntervalMs` / `ciPollAttempts` tune how the broke-check waits on remote CI (during `merge` and
`release --promote`): while the PR's checks are still pending it polls every `ciPollIntervalMs`
(default `5000`) up to `ciPollAttempts` times (default `24` ≈ 2 min) — raise them for slow CI. Set
`ciPollAttempts: 0` to not wait at all: CI is evaluated once, so a still-pending check then **blocks**
the merge rather than being waited on. (This does not fall back to local verify — that happens only
when the PR has no checks at all, independent of these knobs.)

### `worktree`

`{ enabled, dir, setup }` — per-task git worktrees keep the agent's edits isolated;
the spine stays single-canonical in the main checkout. `setup` bootstraps a fresh worktree
(`npm ci`, `flutter pub get`) — doctor warns when verify implies a toolchain and setup is empty.

### `e2e`

`{ command, baseUrl, runsDir, specPattern }` — browser-spec replay for locked specs during verify
(P4). Empty `command` → spec files are skipped (doctor warns if a task locks one). `specPattern`
selects which locked test paths count as browser specs — a suffix (`.spec.yaml`), a comma-separated
list, or an array; a leading `*` is tolerated (`*.e2e.yaml`). Empty/unset → the historical
`.test.yaml`, so existing projects are unchanged.

### `retro`

`{ command }` — optional self-healing agent for `chalk retro`: run digest in → lessons + issues
out; lessons append to durable memory, issues file to the backlog (via `github.command`).

### `feedback`

`{ command }` — optional product-loop agent for `chalk feedback`: signal files from
`.chalk/feedback/` in → issues out, filed to the backlog. Signals archive after processing.

### `discovery`

`{ command }` — optional intake agent for `chalk discover "<brief>"`: brief in → a spec + scoped
tasks out — the front door that turns an idea into a criteria-bearing backlog.

### `portal`

`{ dir }` (default `.project`) — `chalk portal` publishes client-facing scope/milestones/updates
derived from the spine (client-safe event types only). Archived released tasks still appear:
`chalk archive` compaction never erases shipped history.

### `telemetry`

`{ enabled, endpoint }` (default `{ enabled: false, endpoint: '' }`) — **opt-in**, anonymous activation
telemetry. **OFF by default.** When you opt in (prompted once at `chalk init`, or set
`enabled: true`), chalk reports only three funnel **milestones** — `init`, the first GREEN `verify`,
and the first `done` — each **once per install**, together with the chalk version and a random
anonymous install id. The complete payload whitelist is `event, version, installId, ts` and **nothing
else** — no code, paths, prompts, diffs, or repo identity ever leaves the machine. Emission is
fire-and-forget and non-blocking: a network failure never changes a command's exit code. Hard kill
switches: `CHALK_TELEMETRY=0` (env) and CI (`process.env.CI`) both disable it regardless of config.
Inspect exactly what would be sent with `chalk telemetry --show`. `endpoint` overrides the collector
(empty → the default). The anonymous id + sent-milestone flags live in gitignored
`.chalk/local/telemetry.json`.
