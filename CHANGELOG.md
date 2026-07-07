# Changelog

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
