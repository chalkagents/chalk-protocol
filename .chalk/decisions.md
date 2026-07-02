# Decisions (ADR-lite)

## Namespace chalk.json under a protocol key

- _when:_ 2026-06-24T18:58:39.191Z
- _why:_ Keep chalk.json top-level canonical (chalk.schema.json) so the Chalk Browser preserves our config on enrich

## Amended acceptance test for "Enforce the seven gates (P1-P7) via the CLI"

- _when:_ 2026-06-25T13:08:39.115Z
- _why:_ re-baseline locked gate tests after merging #18/#20; 46 tests green, file unchanged from main

## Overrode review gate for "Enforce the seven gates (P1-P7) via the CLI"

- _when:_ 2026-06-25T13:09:13.359Z
- _why:_ umbrella gate task: all P1-P7 gate tests green (46/46); force-review since it is the meta-task that owns the locked suite, not a feature PR

## Lever 3 (break-it gate) ships opt-in via protocol.breakTest

- _when:_ 2026-06-28T12:08:19.909Z
- _why:_ running ONE test file is language-specific; like e2e/regression it stays off until a per-file command template is set, so it can't false-block existing projects

## Handoff docs live under .chalk/handoffs (gitignored, single-canonical via store.root)

- _when:_ 2026-06-28T16:48:12.228Z
- _why:_ ephemeral session-pickup artifacts like runs/; accessed through the Store so a worktree resolves them from the main checkout, no copy-in needed

## Every block (manual, run-loop, pipeline) writes a handoff via the single chalk block / blockTask chokepoint

- _when:_ 2026-06-28T16:54:37.634Z
- _why:_ the pipeline auto-blocks by shelling out to chalk block, so wiring handoff there covers all three block paths without duplication; churn budget accumulates across work/unblock cycles, not within one run loop

## chalk next --json is the one-session-per-task signal (freshSession + handoff path); buildContext folds the handoff in so a fresh session resumes

- _when:_ 2026-06-28T16:59:09.855Z
- _why:_ chalk stays a referee, not a session manager — an orchestrator reads the signal and seeds a clean session; the executor is already one fresh process per task

## Amended acceptance test for "feat: rich 'what was done' PR body recording"

- _when:_ 2026-06-28T17:22:47.889Z
- _why:_ add the BYO-narrative failure-fallback assertion flagged in review (parallels handoff)

## PR body is the canonical 'what was done' record; task.pr.recorded gates merge

- _when:_ 2026-06-28T17:24:12.782Z
- _why:_ humans review on GitHub, so the recording must live in the PR body, not just the spine; recorded flag lets the merge gate enforce a non-empty change set was documented

## Remote review surfaced as PR COMMENTS + an LGTM marker, not a formal gh approval

- _when:_ 2026-06-28T17:31:52.143Z
- _why:_ GitHub forbids approving your own PR from the opening account; a comment works with the single account the pipeline uses; task.pr.lgtm carries the merge-gate signal

## Amended acceptance test for "feat: merge gate requires recording + LGTM + broke-check, then merges"

- _when:_ 2026-06-28T17:49:39.518Z
- _why:_ add ciStatus garbage-payload assertion (med finding) to the locked test

## Merge gate = brokeCheck (CI or local) ∧ recording ∧ (review-required → passing review + LGTM); merge posts LGTM if missing

- _when:_ 2026-06-28T17:52:32.385Z
- _why:_ centralizes the 'safe + accountable' contract in pure mergeBlockers; CI-or-local keeps it working with or without remote CI; merge guarantees an LGTM precedes the merge

## Amended acceptance test for "feat: fix-reverify-rereview loop with churn budget and handoff"

- _when:_ 2026-06-28T18:08:26.140Z
- _why:_ reviewer caught: loop must PUSH the fix (else merge takes the stale branch); assert push each round + rounds on work-fail

## The review fix-loop pushes the fix to the remote branch each round

- _when:_ 2026-06-28T18:11:32.983Z
- _why:_ merge squash-merges the REMOTE branch; without pushing the loop's fix, merge would silently take the stale rejected code (caught in adversarial review). pr-stage can't be re-run (it would re-create the PR), so the loop pushes directly

## Planner surfaces scoping questions via a tolerant text convention (## Questions / Q: lines), not a JSON contract

- _when:_ 2026-06-28T18:17:57.787Z
- _why:_ planners are BYO claude -p; parsing keeps them flexible while still capturing what to validate; questions land in questions.json tied to the task

## Plan-approval is an opt-in hard gate (protocol.plan.required): work refuses / the run pauses until chalk approve-plan

- _when:_ 2026-06-28T18:26:01.834Z
- _why:_ makes planning the human checkpoint the vision calls for — humans read the plan, answer scoping questions, approve; only then does chalk run end-to-end. Off by default so existing flows are unaffected

## Release stage ships from the spine's done tasks (offline), marking each task released for idempotency

- _when:_ 2026-06-28T18:45:06.842Z
- _why:_ the dev cycle already records what was done; release groups done-but-unreleased tasks into notes + a semver bump from change types, tags, and marks them so re-runs are safe — no GitHub round-trip needed

## Feedback loop = retro's engine fed by external product signals (.chalk/feedback/) instead of an internal run digest

- _when:_ 2026-06-28T20:13:55.330Z
- _why:_ closes the cycle ship→learn→backlog; reuses the proven {issues}-JSON + dedup + severity-floor filing pattern so signals become improvement issues the dev cycle then fixes

## Feedback issues are filed via gh (like retro) and signals archived after processing for idempotency

- _when:_ 2026-06-28T20:21:13.054Z
- _why:_ reuses the issue→pull→task loop so product feedback enters the same gated dev cycle; archiving prevents re-analysis and re-filing

## Discovery creates chalk TASKS with acceptance criteria directly (not GitHub issues like feedback)

- _when:_ 2026-06-28T22:09:32.673Z
- _why:_ discovery defines the contract (criteria) up front, so it produces backlog tasks the dev cycle works against; the plan-approval gate then lets a human validate the generated scope before code

## Discovery resolves task deps by title (best-effort) and gates the generated backlog behind plan-approval

- _when:_ 2026-06-28T22:16:56.096Z
- _why:_ the agent emits human-readable after-titles; chalk resolves them to ids so the backlog has real ordering; plan.required means a human validates the proposed scope before work

## Amended acceptance test for "feat: portal model — map the chalk spine to the portal schema"

- _when:_ 2026-06-28T22:31:15.217Z
- _why:_ client-privacy: drop non-client-safe events (don't relabel) so internal titles can't leak to the portal

## Portal data is a deterministic transform of the chalk spine (not a codebase scrape), and drops non-client-safe events

- _when:_ 2026-06-28T22:33:53.613Z
- _why:_ chalk's structured spine (tasks/milestones/updates) maps exactly to the portal schema, more precise than the extract-portal-data skill's scrape; dropping internal event types protects the client view

## Portal files are written as JSON (valid YAML) for robustness/zero-dep instead of a hand-rolled YAML emitter

- _when:_ 2026-06-28T22:39:19.207Z
- _why:_ JSON is a strict subset of YAML so any portal YAML reader parses it identically; avoids subtle indentation/quoting bugs in a hand-written serializer with no yaml dependency

## Released v0.1.0

- _when:_ 2026-06-29T02:40:19.179Z
- _why:_ 30 change(s); tagged v0.1.0

## Live testing found two bugs the per-command suites missed: release ignored --dry-run, portal mis-resolved an absolute --out (join vs resolve)

- _when:_ 2026-06-29T08:26:14.261Z
- _why:_ exercising the real commands end-to-end exposed gaps stub-based unit tests didn't; added --dry-run to release and switched portal to resolve()

## Cross-model adversarial review: chalk doctor warns when the P5 reviewer shares the executor's model

- _when:_ 2026-06-30T14:10:14.133Z
- _why:_ self-preference bias (arxiv 2410.21819) + correlated reviewer/generator failure (2604.08401): a same-model adversary self-prefers and shares blind spots. Chalk can't pick the model (BYO executor) so it surfaces the risk via doctor + a cross-family recommendation. M3 of the harness-improvement plan.

## Harden P7 blindness: doctor fails on git-tracked held-out; audit output-withholding pinned

- _when:_ 2026-06-30T14:17:45.321Z
- _why:_ ImpossibleBench — isolating tests drops cheating to ~0, leaking them restores it. A worktree is a plain checkout, so a committed held-out file lands in the agent's sandbox. doctor now refuses it. Reviewer noted the withholding test pins the console-leak (inherit) regression but not pipe-without-print (not itself a leak). M1a+M1c.

## Amended acceptance test for "feat: mutation-testing adequacy gate — block a change whose changed code has surviving mutants (lever 3, rigorous)"

- _when:_ 2026-06-30T14:28:18.706Z
- _why:_ reviewer fix→re-review: (med) assert the implementation-file filter excludes tests + .chalk; (low) assert {file} substitution; (low) a tool that can't run is inconclusive, not a false survivor

## Mutation-testing adequacy gate (rigorous lever 3): lib/mutation.mjs, opt-in via protocol.mutation, wired into work + run driver

- _when:_ 2026-06-30T14:31:30.233Z
- _why:_ passing tests != adequate — a benchmark test hit 100% coverage / 4% mutation; surviving mutants in changed code = weak assertions (Meta runs this in prod; Stryker --incremental/cargo-mutants --in-diff make it per-change feasible). Adversarial review caught an unasserted impl-file filter; fixed via amend-spec. Generalizes break-it. M2.

## M5: amend-spec invalidates a prior passing review (marks it 'stale'); review re-runs when the last verdict no longer stands

- _when:_ 2026-07-01T01:04:28.901Z
- _why:_ closes the bypass 'get a pass → weaken the locked test via amend-spec → merge on the stale approval'. done/merge P5 checks already require last verdict 'pass'; the fix makes a changed locked test drop that. force-review --why requirement pinned by test. Live-caught: manual 'chalk review' dies on a transient parseVerdict greedy-regex failure (no retry like the pipeline) — robustness follow-up (C1).

## M4: size-scaled P7 stringency — heldOutFloor(loc, locPerTest) makes the held-out count a floor that grows with code size; audit warns, phase gate refuses (overridable)

- _when:_ 2026-07-01T01:10:41.728Z
- _why:_ SpecBench: the held-out-vs-visible gap grows ~28pts per 10x LOC, so a fixed oracle decays. Previously codeSize only triggered staleness; now the bar actually rises with the code — making 'stringency scales with code size' a real mechanism instead of a doc claim. Default locPerTest 2000 keeps tiny projects at floor 0. M4.

## C1: robust reviewer verdict parsing — lib/json.mjs balanced-brace scanner (jsonObjects/parseLastJson); review.mjs parseVerdict recovers the last valid verdict object

- _when:_ 2026-07-01T01:46:34.872Z
- _why:_ the greedy /{...}/ span grabbed from a stray brace in the reviewer's prose to EOF and failed to parse, blocking a real adversarial review twice this session. Now scans for balanced top-level objects (ignoring braces inside strings) and recovers the operative one. The same fragile pattern remains in retro/feedback/discovery — C2 de-drift follow-up (adopt parseLastJson there).

## C2: retro/feedback/discovery adopt the robust parseLastJson — duplicated greedy /{...}/ JSON regex removed

- _when:_ 2026-07-01T01:59:52.080Z
- _why:_ the same fragile parse that broke the C1 reviewer lived in all three lifecycle agents; they now recover their {lessons,issues}/{issues}/{tasks} payload from prose-wrapped output via lib/json.mjs (shape-predicate per module). Reviewer noted an unbalanced lone-brace corner case — outside contract, and the old regex failed on it too (not a regression).

## Amended acceptance test for "fix: chalk review retries once on a transient reviewer failure (match the pipeline stage)"

- _when:_ 2026-07-01T03:50:43.558Z
- _why:_ reviewer (test-adequacy): cover the fatal error→error path and that the retry is BOUNDED (invocation-count assertion); add a --no-retry suppression test

## C1-remainder: chalk review retries once on a transient reviewer failure; pipeline + reviewloop pass --no-retry (they own stage-level retry)

- _when:_ 2026-07-01T04:52:52.364Z
- _why:_ a manual/direct 'chalk review' died on the first transient flake (a truncated response, then a connection drop) twice this session, unlike the pipeline stage. Now a bounded retry-once — only a second consecutive error is fatal. Reviewer's test-adequacy note addressed via amend-spec, which invalidated the prior pass (M5) and forced a re-review.

## Release hardening: chalk release tags FIRST; in a git repo a tag failure is fatal before writing CHANGELOG or marking tasks released

- _when:_ 2026-07-01T07:42:53.337Z
- _why:_ it used to swallow a failed git tag yet mark work released, shipping onto an untagged version that the next release (seeing them marked) would never re-tag. A non-git project legitimately can't tag → stays a CHANGELOG/pkg-only release. First of the silent-failure autonomous-path hardenings.

## Amended acceptance test for "feat: gate hardening — probe-error disambiguation, reviewer diff truncation marker + file stat, silent-failure warnings, mutation CLI wiring test"

- _when:_ 2026-07-02T05:23:14.571Z
- _why:_ review blocked: criterion-5 cost-ledger and merge-label behaviors were untested (vacuous under the break-it rule); added 3 tests (warn-once-per-process across store instances, merge LOCAL-verify label, no-false-promise truncation marker) and re-locked

## Amended acceptance test for "feat: gate hardening — probe-error disambiguation, reviewer diff truncation marker + file stat, silent-failure warnings, mutation CLI wiring test"

- _when:_ 2026-07-02T05:24:00.369Z
- _why:_ fix the merge-label scaffold: the stub issue body needed a checklist item so issue-pull yields a P1 criterion (work refused on todo otherwise); suite green before re-lock this time

## Amended acceptance test for "feat: chalk demo — built-in 1-minute no-LLM lifecycle demo with two visible gate refusals"

- _when:_ 2026-07-02T05:35:57.935Z
- _why:_ review blocked: criterion-5 (wrapper delegation + help listing) and the failure-keeps-dir branch were untested, refusal identity unpinned; added 2 tests + 3 assertions (plan-not-approved identity, restore narrative, CHALK_DEMO_SABOTAGE failure path) — suite green before re-lock

## Amended acceptance test for "feat: init hardening — preset auto-detect default, vacuous-verify warning, --verify-test/--bare, next-steps epilogue, presets set breakTest"

- _when:_ 2026-07-02T05:48:20.358Z
- _why:_ review blocked: flutter/dart breakTest + go omission, non-node detectPreset branches, and the doctor line were unpinned; added detectPreset/PRESETS unit coverage, doctor + start assertions, and the bare--preset no-detect notice (suite green before re-lock)

## Amended acceptance test for "feat: init --executor claude|none — ship agent templates in share/agents, retrofit via chalk agents --claude"

- _when:_ 2026-07-02T06:00:17.851Z
- _why:_ review blocked HIGH: share/ was not in package.json files (npm-installed users would ENOENT) — added share to files + npm-pack tarball assertion; created the referenced claude-code.md doc + existence test; drift gate strengthened to whole-file-minus-skills-line equality (suite green before re-lock)

## Amended acceptance test for "feat: doctor for strangers — per-OS gh install hints, optional-executor framing, --json output, unused-gates nudge"

- _when:_ 2026-07-02T06:11:42.603Z
- _why:_ review blocked HIGH: doctor wiring (hint interpolation + pipeline-only scoping in the fail line) was untested and the custom-command path dangled an em-dash; added PATH-scrub wiring tests, no-dangling-dash fix, READY exit-0 json/pretty parity, all-armed no-nudge case (green before re-lock)

## Amended acceptance test for "docs: onboarding — README rewrite (demo top-fold, comparison table), QUICKSTART.md, docs/CONFIG.md, claude-code integration doc"

- _when:_ 2026-07-02T06:29:32.340Z
- _why:_ review blocked: demo.tape and the doc-link targets (incl. claude-code.md) were unguarded; added a general dead-relative-link gate across all four onboarding docs + a tape assertion (green before re-lock)

## Released v0.1.0

- _when:_ 2026-07-02T10:19:42.204Z
- _why:_ 49 change(s); tagged v0.1.0

## Overrode review gate for "chore: cut v0.1.0 via chalk release, seed v0.2 roadmap issues, enable GitHub Discussions"

- _when:_ 2026-07-02T10:44:01.470Z
- _why:_ external-state ops task: the no-network reviewer rightly cannot verify registry/GitHub state. Operator evidence from this session: npm view chalk-protocol → 0.1.0 with tarball URL; npx chalk-protocol@0.1.0 demo on a clean dir → LOOP COMPLETE, 2 gates refused; gh release created at /releases/tag/v0.1.0 on pushed tag; issues #78-#86,#88,#89 exist; gh repo hasDiscussionsEnabled=true; archive compaction is in-repo at .chalk/archive/
