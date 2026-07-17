# Changelog

## v0.3.0 — 2026-07-17

### Features
- release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips (#100)
- chalk release --promote — protected-main release flow (promotion PR + tag on main's tip) (#103)
- chalk review advances pipeline.stage to 'reviewed' even when no PR exists — manual-order review pollutes the commit/pr stage guards (#104)
- token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable (#105)
- chalk stats — gate-efficacy report from the event log (#109)
- dogfood — make chalk's own loop (issue pull → autopilot → retro) the default way chalk contributes to chalk (#112)
- give reviewer-induced auto-blocks a distinct `--needs` category instead of `human-input` (#116)
- opt-in all-locks integrity — done tasks' locked tests stay protected (#119)
- tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk (#120)
- configurable e2e spec pattern (not just *.test.yaml) (#121)
- context budget — cap buildContext size and prune injected lessons (#123)
- held-out set outside the repo root (manual-mode blindness) (#124)
- chalk commit silently no-ops after the first commit, so review-fix changes never get committed
- unify the intake-commit spine paths and the reviewer diff-exclude list into one shared constant
- chalk spec --test from a linked worktree records a '../<worktree>/…' lock path — dead after cleanup
- parallel task execution — scope P6 integrity per worktree, lock spine writes, fan out the driver
- opt-in anonymous activation telemetry (init → first green verify → done funnel)
- alignment checkpoint before build — human accepts the criteria/outcome, not just the plan
- reviewer emits a decision digest — the accept button, not just pass/block
- risk-based decision triage + a director inbox — own the empty middle
- B1 · a durable, structured director-decision record
- A1 · redirect re-opens the task as an actionable directive
- A2 · inject pending director corrections into buildContext
- A3 · driver re-runs a redirected task and resolves the directive
- B2 · inject prior director decisions into new-task context (the moat)
- C1 · chalk raise — the mid-flight raise primitive
- C2 · executor contract — raise a fork instead of guessing
- C3 · raised forks pause the task + route to the inbox
- D2 · skills as a first-class part (.chalk/skills → context)
- D1 · chalk harness — the kit made visible
- D3 · reframe the gates as one optional 'Checks' part

### Fixes
- chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step) (#93)
- CONFIG.md drift gate only validates top-level protocol keys (#94)
- evidence-push failures are swallowed (catch{}) — blob-SHA 404s surface as broken PR images (#95)
- sameModelFamily can't see env-var models (CHALK_OPENCODE_MODEL) — cross-model warning inert for opencode (#96)
- spec-lock gate never checks locked tests are tracked in git — a pinned test can ship untracked and CI runs a vacuous green (#115)
- untrackedLockedTests exempts every .chalk/ pinned path — an e2e spec locked under .chalk/tests/ escapes the tracking gate (#127)
- passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task (#128)
- issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise (#130)
- release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md (#132)
- untrackedLockedTests compares pinned paths verbatim against git ls-files — a './'-prefixed, backslashed, or case-differing pin false-blocks done/pr (#137)

### Docs
- add a chalk-commit skill for uniform commit discipline
- add a chalk-ship skill for pushing and landing PRs safely
- add a chalk-branch-cleanup skill for pruning stale branches
- add a chalk-locked-tests skill for the pin/amend test workflow
- add a chalk-debug-gate skill for diagnosing RED verify / review BLOCK / audit RED
- add a chalk-add-command skill for scaffolding a new CLI command
- add a chalk-release skill for the release + protected-deploy flow
- add a chalk-dogfood skill for contributing to chalk via chalk
- add a chalk-autopilot-setup skill for readying an unattended run

### Other
- cut v0.1.0 via chalk release, seed v0.2 roadmap issues, enable GitHub Discussions
- chalk start refuses a second in-progress task unless protocol.parallel.enabled — make the one-at-a-time convention a hard gate (#110 slice 4)
- spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)
- chalk pipeline --parallel N — fan out per-task stage chains in worktrees, serialize merges at the gate (#110 slice 3)
- vacuous verify trap — empty protocol.verify auto-passes P4; tighten chalk doctor to a blocker (#152)
- review diff-capture silently passes on no diff — abort loudly instead of a vacuous verdict (#151)
- merge ff-pull failure strands a stale base — chalk branch cuts from the fresh remote base (#150)
- spine/protocol migration — stamp writer version, detect skew on open, gated chalk migrate (#159)
- chalk stats --public — PII-free shareable gate-efficacy artifact (markdown + shields badge) (#156)
- chalk feedback --submit — upstream feedback via prefilled GitHub issue URL (#157)
- package-update handling — fix --version, opt-out update notifier, chalk upgrade (#158)
- document the promote CI-poll knobs (ciPollIntervalMs/ciPollAttempts) in CONFIG + a runtime hint (#153)
- post-run feedback nudge — after a productive `chalk run`, point the user at `chalk feedback --submit` (opt-out via CHALK_NO_NUDGE) (#155)
- decouple the issue-pull count from the loop parser — one shared literal so a CLI reword can't silently zero the standing loop's steady-state detection
- reviewer diffs against the LOCAL base first — a stale/divergent local dev balloons the review diff to the whole branch history; prefer origin/<base>
- add concurrency groups — cancel superseded test runs; serialize releases without cancelling an in-flight publish

## v0.2.0 — 2026-07-07

### Features
- release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips (#100)
- chalk release --promote — protected-main release flow (promotion PR + tag on main's tip) (#103)
- chalk review advances pipeline.stage to 'reviewed' even when no PR exists — manual-order review pollutes the commit/pr stage guards (#104)
- token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable (#105)
- chalk stats — gate-efficacy report from the event log (#109)
- dogfood — make chalk's own loop (issue pull → autopilot → retro) the default way chalk contributes to chalk (#112)
- give reviewer-induced auto-blocks a distinct `--needs` category instead of `human-input` (#116)
- opt-in all-locks integrity — done tasks' locked tests stay protected (#119)
- tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk (#120)
- configurable e2e spec pattern (not just *.test.yaml) (#121)
- context budget — cap buildContext size and prune injected lessons (#123)
- held-out set outside the repo root (manual-mode blindness) (#124)
- chalk commit silently no-ops after the first commit, so review-fix changes never get committed

### Fixes
- chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step) (#93)
- CONFIG.md drift gate only validates top-level protocol keys (#94)
- evidence-push failures are swallowed (catch{}) — blob-SHA 404s surface as broken PR images (#95)
- sameModelFamily can't see env-var models (CHALK_OPENCODE_MODEL) — cross-model warning inert for opencode (#96)
- spec-lock gate never checks locked tests are tracked in git — a pinned test can ship untracked and CI runs a vacuous green (#115)
- untrackedLockedTests exempts every .chalk/ pinned path — an e2e spec locked under .chalk/tests/ escapes the tracking gate (#127)
- passing `chalk review` never clears a needs:review block — the printed guidance omits `chalk unblock`, stranding the task (#128)
- issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise (#130)
- release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md (#132)
- untrackedLockedTests compares pinned paths verbatim against git ls-files — a './'-prefixed, backslashed, or case-differing pin false-blocks done/pr (#137)

### Other
- cut v0.1.0 via chalk release, seed v0.2 roadmap issues, enable GitHub Discussions

## v0.1.0 — 2026-07-02

### Features
- chalk decisions (#24)
- chalk lesson list (#25)
- chalk log --grep <text> (#26)
- chalk lesson dispatch misroutes lesson text beginning with 'list' (#31)
- chalk lesson list cap diverges from the memory injected into agents (#32)
- guard chalk decisions against a missing decisions.md (#33)
- add explicit `chalk lesson add` subcommand to disambiguate from `list` (#36)
- make pipeline stages idempotent so an interrupted sweep resumes cleanly (#38)
- review-stage failures auto-block as human-input without surfacing findings or retrying (#44)
- pipeline discards a failed stage's stdout/stderr, leaving auto-blocks undiagnosable (#45)

### Other
- Enforce the seven gates (P1-P7) via the CLI
- break-it gate — block a vacuous locked test (lever 3)
- chalk handoff — structured handoff doc (template + optional agent)
- auto-handoff on block + churn-threshold handoff
- feed handoff into context + fresh-session signal (chalk next --json)
- rich 'what was done' PR body recording
- reviewer posts findings + LGTM to the remote PR
- broke-check — remote CI gate with local fallback
- merge gate requires recording + LGTM + broke-check, then merges
- fix-reverify-rereview loop with churn budget and handoff
- planner emits a plan plus scoping questions
- chalk approve-plan gate — work refuses an unapproved required plan
- release notes — collect merged work, bump version, render notes
- chalk release — write CHANGELOG, bump package.json, tag, mark released
- feedback signals — collect external signals and run the analysis agent
- chalk feedback — file improvement issues from signals, archive processed
- discovery — run the intake agent and normalize a proposed backlog
- chalk discover — turn a brief into scoped, criteria-bearing tasks
- portal model — map the chalk spine to the portal schema
- chalk portal — write schema-conformant .project files from the spine
- testing-found bugs — release --dry-run + portal absolute --out
- cross-model review — chalk doctor warns when the reviewer shares the executor model
- harden P7 blindness — doctor fails on git-tracked held-out + pin audit output withholding
- mutation-testing adequacy gate — block a change whose changed code has surviving mutants (lever 3, rigorous)
- amend-spec invalidates a prior passing review (close the weaken-after-approval bypass)
- size-scaled P7 stringency — held-out set floor grows with code size (SpecBench)
- robust reviewer verdict parsing — recover the verdict JSON amid reasoning/prose (a transient parse failure blocked a real review)
- adopt robust parseLastJson in retro/feedback/discovery (kill the duplicated greedy JSON regex)
- chalk review retries once on a transient reviewer failure (match the pipeline stage)
- chalk release fails loudly on a git-tag error instead of marking work released with no tag
- OSS hygiene — LICENSE, neutral pipeline-test fixtures, issue/PR templates, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT
- gate hardening — probe-error disambiguation, reviewer diff truncation marker + file stat, silent-failure warnings, mutation CLI wiring test
- chalk demo — built-in 1-minute no-LLM lifecycle demo with two visible gate refusals
- init hardening — preset auto-detect default, vacuous-verify warning, --verify-test/--bare, next-steps epilogue, presets set breakTest
- init --executor claude|none — ship agent templates in share/agents, retrofit via chalk agents --claude
- doctor for strangers — per-OS gh install hints, optional-executor framing, --json output, unused-gates nudge
- chalk archive — compact released tasks + old events into .chalk/archive
- onboarding — README rewrite (demo top-fold, comparison table), QUICKSTART.md, docs/CONFIG.md, claude-code integration doc
- npm publish readiness — package metadata + files array, release.yml trusted publishing, pack-manifest test
