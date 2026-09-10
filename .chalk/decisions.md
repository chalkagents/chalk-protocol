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

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-07-06T06:51:02.465Z
- _why:_ release.yml dropped the npm-pkg-set tag-normalization step (chalk release --commit now tags the bumped commit); the workflow assertion flips from requiring the step to requiring its absence

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-07-06T06:54:27.222Z
- _why:_ sweep the stale header prose flagged by review: the comment still described the tag-normalization flow the assertion below now forbids

## chalk release --commit commits the release artifacts then tags that commit; release.yml publishes the tagged tree as-is

- _when:_ 2026-07-06T06:57:47.934Z
- _why:_ tag-first left the tagged tree on the pre-bump version, forcing release.yml to normalize from the tag name; commit-then-tag makes the tag self-contained while keeping collision safety as an up-front probe

## Amended acceptance test for "fix: CONFIG.md drift gate only validates top-level protocol keys"

- _when:_ 2026-07-06T07:04:31.068Z
- _why:_ the CONFIG.md drift gate recursed one nested level (issue #89): the inline top-level-only comparison is replaced by lib/config.mjs configDrift(), which also pins each section's { … } key list to the initSpine nested keys

## Amended acceptance test for "fix: CONFIG.md drift gate only validates top-level protocol keys"

- _when:_ 2026-07-06T07:07:54.053Z
- _why:_ close the review's med finding: a default degrading to a scalar/empty object while the doc still lists a { … } key set now flags every documented key as stale instead of silently skipping the section

## CONFIG.md drift gate goes one nested level deep via lib/config.mjs configDrift(); each doc section's { … } key list must equal initSpine's nested keys, both directions

- _when:_ 2026-07-06T07:10:50.312Z
- _why:_ the old gate compared Object.keys(meta.protocol) only, so nested keys could drift or appear undocumented; one level is the depth CONFIG.md's format can express — deeper levels (labelType map entries, {cmd,when} value shapes) are data, not schema. Forced by honesty: initSpine now writes the documented-but-uninitialized defaults (review.requiredAt, regression.locPerTest, github.ciPoll*)

## Amended acceptance test for "fix: evidence-push failures are swallowed (catch{}) — blob-SHA 404s surface as broken PR images"

- _when:_ 2026-07-06T07:19:16.809Z
- _why:_ review blocked on a vacuous warning: execSync's message line 0 is only 'Command failed: git push', so the warning now extracts git's stderr cause and the locked test asserts the actual git error text appears

## chalk evidence surfaces push failures: git's stderr cause in a ⚠ line, PR body edit skipped (no 404 blob URLs), honest update-feed title

- _when:_ 2026-07-06T07:25:50.398Z
- _why:_ the swallowed catch{} shipped broken image links with no warning at the source (harness review finding 7); the stage still advances by design — evidence is best-effort and re-runs must not duplicate the commit

## modelSignature resolves the opencode adapters to their real identity: bin 'opencode' + CHALK_OPENCODE_MODEL (explicit --model wins); env injectable for tests

- _when:_ 2026-07-06T07:31:31.112Z
- _why:_ the command string hid both identity halves (bin was 'node', model lived in the env), so the doctor's same-model-reviewer warning was blind for opencode users and false-matched arbitrary node scripts

## Retrofitted the 2026-07-06 sweep onto the pipeline: 4 hand-made main commits became PRs #93-#96, each landed by chalk merge (CI broke-check + review LGTM), not by hand

- _when:_ 2026-07-06T07:48:22.696Z
- _why:_ the manual loop had gated the WORK (verify+review) but skipped the LANDING gate; tasks were flipped back to in-progress and pointed at their PRs so the gate could rule — also surfaced that this repo's chalk.json predated protocol.github (now configured), which had silently disabled remote-CI broke-checks

## Branch model: dev is the integration branch (all PRs target dev; protocol.github.base=dev), main is the deployable branch advanced only by dev→main promotion PRs at release time

- _when:_ 2026-07-06T07:57:20.007Z
- _why:_ keeps main always releasable (release.yml publishes on tags cut from main) while the pipeline's issue→merge loop iterates on dev; GitHub default branch flipped to dev so new PRs base there automatically

## Server-side enforcement of the branch model: main protected (PR required, test check, enforce_admins, no force-push/delete), dev protected against force-push/delete only, merge methods = squash (dev PRs) + merge commit (promotions), rebase off

- _when:_ 2026-07-06T08:06:00.633Z
- _why:_ main's deployability is now enforced by GitHub, not convention; dev stays friction-free for the pipeline (required checks on dev would reject direct spine pushes since fresh commits carry no check results). Release flow under protection: release --commit --no-tag on dev, promotion PR merged with a merge commit, tag main's tip (filed #98 to teach chalk release --promote natively)

## Amended acceptance test for "fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips"

- _when:_ 2026-07-06T08:23:16.093Z
- _why:_ review blocked the HEAD-only/no-discriminator design: recovery now keys on the Released-vX decision as the completion marker, finds buried orphans, and defers post-interruption arrivals — the locked test grew the four cases pinning exactly those behaviors

## Amended acceptance test for "fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips"

- _when:_ 2026-07-06T08:25:52.787Z
- _why:_ pin the dry-run resume preview flagged by review (the line was silently revertible): a post-interruption --dry-run must say 'would RESUME' and write nothing

## Amended acceptance test for "feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)"

- _when:_ 2026-07-06T08:45:04.267Z
- _why:_ review blocked three real recovery holes: resume was unreachable with a leftover local tag, a merged PR broke the re-run choreography (pr create dies with 'no commits between'), and the fresh path lost the up-front collision probe — the locked test grew a real-merge-commit stub, the post-merge tag-push-failure resume, the stale-tag collision, and the pending-CI abort

## Amended acceptance test for "feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)"

- _when:_ 2026-07-06T08:48:06.645Z
- _why:_ pin the two review med findings: the pre-merge re-run must FIND the open PR (creates.length===1 — real gh rejects a duplicate pr create) and the promote resume must defer late-arriving tasks instead of absorbing them into the frozen notes

## Amended acceptance test for "fix: chalk review advances pipeline.stage to 'reviewed' even when no PR exists — manual-order review pollutes the commit/pr stage guards"

- _when:_ 2026-07-06T09:22:47.012Z
- _why:_ pin the adversary-path stage guard flagged by review (line 1374 was revertible alone): a stub reviewer passing pre-PR must leave the stage untouched

## Amended acceptance test for "feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable"

- _when:_ 2026-07-06T09:39:26.764Z
- _why:_ review blocked on individually-revertible stage wirings: retro and plan envelope e2e pins added (a reverted call site now fails the suite); also stdout-first on reviewer nonzero exit (stderr after the envelope hid the verdict) and a 64MiB capture buffer

## Amended acceptance test for "feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable"

- _when:_ 2026-07-06T09:46:05.272Z
- _why:_ review blocked twice on revertible wirings: every stage (review/retro/plan/discovery/feedback/executor) is now pinned e2e through a fake claude on PATH that emits the envelope ONLY when the flag was injected; also pinned stdout-first on nonzero exit, the banner-tolerant envelope parse, and the >1MiB capture buffer

## Amended acceptance test for "feat: chalk stats — gate-efficacy report from the event log"

- _when:_ 2026-07-06T10:24:33.478Z
- _why:_ review BLOCK findings: pin churn.worst (attempts+handoffs per task), reject garbage --since, cover the unreviewed bucket/handLanded/passes/audit.red, and couple the real emitters (chalk run verify-RED+handoff, chalk done --force-review) to the stats parser via lib/markers.mjs

## chalk stats mines the spine+archive via shared event markers (lib/markers.mjs)

- _when:_ 2026-07-06T10:28:57.769Z
- _why:_ stats matches event-log strings the emitters write; before markers.mjs each side hardcoded its own copy and a reword would silently zero a stat. Emitters (run/handoff/done/audit) and the parser now share constants, coupled end-to-end by the locked test.

## Amended acceptance test for "feat: give reviewer-induced auto-blocks a distinct `--needs` category instead of `human-input`"

- _when:_ 2026-07-06T12:33:03.807Z
- _why:_ review BLOCK: pin chalk status's distinct review-block rendering (criterion 3 names both surfaces) and the reviewer-ERROR path (crash ≠ refutation — stays human-input per the design-intent finding)

## Amended acceptance test for "feat: tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk"

- _when:_ 2026-07-07T08:47:24.160Z
- _why:_ re-lock after finalizing the test (opt-in refactor + accurate title) before first verify — file is green

## Amended acceptance test for "feat: tamper-evident spine — warn when tasks.json/chalk.json changed outside chalk"

- _when:_ 2026-07-07T08:51:54.342Z
- _why:_ review BLOCK: pin default-OFF inertness (criteria 1/4 — no hashing/warning/files, no event), the true no-baseline-file first-run establishment path, and chalk.json warn-once + re-arm on a fresh edit

## Amended acceptance test for "feat: configurable e2e spec pattern (not just *.test.yaml)"

- _when:_ 2026-07-07T09:08:41.641Z
- _why:_ review BLOCK: a fifth spec-ness site (evidence/PR pipeline stage, bin/chalk.mjs) hardcoded .test.yaml — now uses isSpec(pattern); added doctor-warning + evidence-stage coverage so all sites in criterion 2 are pinned

## Amended acceptance test for "fix: issue-intake spine writes leak into unrelated task branches — recurring scoped-diff review noise"

- _when:_ 2026-07-07T10:35:22.657Z
- _why:_ review BLOCK: the intake commit used bare git commit (whole index) — a data hazard sweeping a user's pre-staged work; switched to gitCommitPaths (git commit -- <pathspec>) and added a scoping-guarantee test that pre-stages an unrelated file and asserts it's untouched

## Overrode review gate for "fix: chalk commit silently no-ops after the first commit, so review-fix changes never get committed"

- _when:_ 2026-07-07T11:24:06.269Z
- _why:_ PR #135 already merged to dev and adversarially reviewed (PASS); the task's spine record was reverted by a dev rebase during the #114/#125 recovery — reconciling state to reflect reality

## Unify spine-state paths in one SPINE_STATE_PATHS constant (store.mjs); intake commit + reviewer excludes both derive from it (#131)

- _when:_ 2026-07-08T14:41:50.209Z
- _why:_ The intake-commit list was a 4-path subset of the reviewer's 10-path exclude set, so review-hidden-but-intake-uncommitted paths (chalk.json/questions.json/decisions.md/lessons.md/handoffs/analysis) floated into the next task branch — the #114 scoped-diff leak. Intake now commits the FULL set; a manually-edited uncommitted chalk.json at pull time is swept into the chore(spine) commit, which is correct since chalk owns spine state.

## Record locked-test paths relative to the worktree's project root, not the main checkout (#111)

- _when:_ 2026-07-08T15:04:58.793Z
- _why:_ chalk spec/amend-spec --test run from a task worktree recorded a ../<worktree>/… path that dies after chalk merge cleans the worktree up. lockTest now maps main->worktree by the in-repo offset (linkedWorktree, pure fs) and records tree-relative — valid in every checkout; non-worktree behavior unchanged.

## Decompose #110 (parallel task execution) into 4 slices; scope task-96eabc0 to slice 1 (per-worktree P6)

- _when:_ 2026-07-08T15:46:44.302Z
- _why:_ The issue bundles 4 workstreams (per-worktree P6 integrity, atomic spine writes, start-gate, driver fan-out) — too broad for one gate. Slice 1 (verify() checks each in-progress task's locks in ITS OWN worktree) is the keystone hard-tooth and is self-contained + locally verifiable. The done-task all-locks loop stays at cwd to preserve the #80 anti-cheat. Slices 2-4 queued as follow-ons with dep edges.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-07-08T16:14:04.920Z
- _why:_ Add coverage the review required: stale-lock self-heal, archive routing through the lock, and gitignore of .lock/temp files (#110 slice 2 review fixes)

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-07-08T16:18:19.790Z
- _why:_ Add a revert-detectable atomicity test (concurrent reader during unlocked writes) to pin criterion 2 — review round 2 required it (#110 slice 2)

## Amended acceptance test for "feat: chalk pipeline --parallel N — fan out per-task stage chains in worktrees, serialize merges at the gate (#110 slice 3)"

- _when:_ 2026-07-08T16:41:03.892Z
- _why:_ Review round 1 fixes: cover the default production path (stopBefore truncation via dry-run + a stub-CLI test of defaultRunChain/defaultRunMerge command construction and phase ordering) — #110 slice 3

## Amended acceptance test for "fix: merge ff-pull failure strands a stale base — chalk branch cuts from the fresh remote base (#150)"

- _when:_ 2026-07-08T17:45:05.643Z
- _why:_ Review fix: cover the 'remote exists but base unresolvable → warn' path and gate the warning on git remote (not a parseable origin URL) — #150

## Migrated spine 1.0 → 1.1

- _when:_ 2026-07-08T18:27:17.321Z
- _why:_ chalk migrate: stamp the writer version (chalk-protocol package) on the spine (backup: /Users/devid/Documents/projects/personal/chalk-protocol/.chalk/backups/2026-07-08T18-27-17-319Z)

## Amended acceptance test for "feat: package-update handling — fix --version, opt-out update notifier, chalk upgrade (#158)"

- _when:_ 2026-07-09T07:39:55.823Z
- _why:_ Review round 1: cover chalk upgrade --dry-run (criterion 3, was untested) and the interactive notice-producing path (#158)

## Amended acceptance test for "docs: document the promote CI-poll knobs (ciPollIntervalMs/ciPollAttempts) in CONFIG + a runtime hint (#153)"

- _when:_ 2026-07-09T07:52:05.358Z
- _why:_ Review fix: corrected the inaccurate ciPollAttempts:0 description (it BLOCKS a pending check, not local-verify fallback) + added a brokeCheck behavioral test tying the doc to code (#153)

## Post-run feedback nudge points users at chalk feedback --submit

- _when:_ 2026-07-12T15:14:07.505Z
- _why:_ Closes the product loop at the moment of experience; opt-out via CHALK_NO_NUDGE keeps it from nagging

## issue-pull count phrasing + parser unified in lib/pull-count.mjs

- _when:_ 2026-07-13T02:49:28.500Z
- _why:_ Emitter/parser held duplicate literals; a CLI reword would silently zero the standing loop's steady-state count

## Reviewer prefers origin/<base> over local base in captureDiff

- _when:_ 2026-07-13T04:12:44.429Z
- _why:_ Stale/divergent local base branch ballooned the review diff to the whole branch history, causing false scope-bloat findings

## CI concurrency: test cancels superseded runs, release serializes without cancelling

- _when:_ 2026-07-13T05:12:55.215Z
- _why:_ Redundant test runs pile up on PR+push; concurrent release tags could double-publish — but a publish must never be cancelled mid-flight

## Amended acceptance test for "feat: opt-in anonymous activation telemetry (init → first green verify → done funnel)"

- _when:_ 2026-07-14T08:29:33.061Z
- _why:_ Add end-to-end CLI call-site tests (init/verify/done deliver to a local collector; OFF delivers nothing; unreachable endpoint never changes exit code) to close the review's test-adequacy gap; redesigned to mark-sent only on successful delivery

## Amended acceptance test for "feat: opt-in anonymous activation telemetry (init → first green verify → done funnel)"

- _when:_ 2026-07-14T08:38:32.022Z
- _why:_ Add prompt-consent unit tests (affirmative-only, default N, inert non-interactively), ENABLED --show coverage, and --no-telemetry/off cases; emission is now truly fire-and-forget (non-awaited, exitCode)

## Amended acceptance test for "feat(director): alignment checkpoint before build — human accepts the criteria/outcome, not just the plan"

- _when:_ 2026-07-17T08:11:11.997Z
- _why:_ Harden the gate contract per review finding: pin that a refused (unaligned) chalk work leaves no side effect — task state unchanged, criteria not marked accepted. Non-blocking low, but 'a refusal must not mutate state' is a core property of a gate.

## Amended acceptance test for "feat(director): risk-based decision triage + a director inbox — own the empty middle"

- _when:_ 2026-07-17T09:08:16.337Z
- _why:_ Address review BLOCK (test-adequacy): add a chalk review test asserting criterion 2 — the digest is ranked highest-risk-first and risk-badged (reverting the render fails it). Also: realistic 13-char fixture id + full-id inbox ref (no prefix truncation), redirect logs with a taskId link.

## Amended acceptance test for "feat(director-loop): B1 · a durable, structured director-decision record"

- _when:_ 2026-07-17T09:42:47.439Z
- _why:_ Review-driven schema fix: split the overloaded 'why' into 'rationale' (agent's reason, always) and 'instruction' (director's course-correction, redirect only). The single field meant two things by verdict, and #202's compounding feed builds on this record — a hard-to-undo schema, so fix it at the foundation.

## director-record schema: split 'why' into 'rationale' + 'instruction' (#201)

- _when:_ 2026-07-17T09:48:21.910Z
- _why:_ Criterion 1 named a single 'why' field. During review the reviewer (and its own risk digest, ranked HIGH) flagged that 'why' meant two different things by verdict: the agent's rationale for an accepted call vs the director's course-correction for a redirected one. Since #202's compounding feed reads this record and must say 'apply this rationale' vs 'do this instead', the record ships distinct 'rationale' (agent, always) + 'instruction' (director, redirect-only) fields, pinned by the locked test. Ratifying the deviation from criterion 1's literal field name.

## Amended acceptance test for "feat(director-loop): A3 · driver re-runs a redirected task and resolves the directive"

- _when:_ 2026-07-17T10:22:20.702Z
- _why:_ Review BLOCK fix: (1) cover BOTH completion paths — added a resolveDirectives unit + a source assertion that done AND pipeline merge both call it (was vacuous for the merge path); (2) tighten runnableTasks to key on reopenedAt (needsRework) so a redirect on an already-active task can't be re-admitted/double-executed by chalk run --parallel.

## Amended acceptance test for "feat(director-loop): A3 · driver re-runs a redirected task and resolves the directive"

- _when:_ 2026-07-17T10:27:16.364Z
- _why:_ Review-driven correctness fix: resolveDirectives now CLEARS reopenedAt when the rework lands, so a stale re-open marker can never coexist with a later active-redirect and re-admit an in-flight task. Pinned the invariant (clear-on-resolve + rework-terminates).

## Amended acceptance test for "feat(director-loop): B2 · inject prior director decisions into new-task context (the moat)"

- _when:_ 2026-07-17T10:42:08.661Z
- _why:_ Review coverage gap: pin that the director block and lessons COEXIST (director-first, lessons still present) — the budget-priority design was implemented but unverified; a regression dropping lessons entirely would otherwise pass.

## Amended acceptance test for "feat(director-loop): B2 · inject prior director decisions into new-task context (the moat)"

- _when:_ 2026-07-17T10:46:49.223Z
- _why:_ Review med fix: the compounding block now excludes the CURRENT task's own decisions (they ride the essential Director corrections block, #199) — removes the duplicate-signal a re-opened task would show, and makes the block genuinely 'prior taste into a new task'. Pinned.

## Amended acceptance test for "feat(director-mid-flight): C2 · executor contract — raise a fork instead of guessing"

- _when:_ 2026-07-17T11:19:13.253Z
- _why:_ Review med fix: pin the elastic behavior directly — the raise block is present at a normal budget and DROPS under a tiny one while essentials survive (deleting the raiseFits guard now fails a test).

## Amended acceptance test for "feat(director-mid-flight): C3 · raised forks pause the task + route to the inbox"

- _when:_ 2026-07-17T11:35:08.846Z
- _why:_ Review BLOCK fix: the driver blocked raises as the default needs:human-input, but answer/criterion expect needs:decision — so answering wouldn't unblock a driver-blocked task. Fixed run.mjs to pass 'decision', and added a real driver end-to-end test (executor raises → driver blocks needs:decision → answer unblocks) so the mismatch can't hide.

## Amended acceptance test for "feat(director-mid-flight): C3 · raised forks pause the task + route to the inbox"

- _when:_ 2026-07-17T11:38:58.201Z
- _why:_ Review low: pin the directorLines 'answered' render — an answered raise compounds into a new task's context as its own 'answered: fork → decision' line, not silently as 'accepted' (reverting the branch now fails).

## Amended acceptance test for "feat(director-kit): D2 · skills as a first-class part (.chalk/skills → context)"

- _when:_ 2026-07-17T12:29:30.229Z
- _why:_ Review low: pin the skills-vs-lessons budget priority (skills rank ahead, lessons still kept) — the deliberate 'author-curated over auto-collected' ordering was untested; reversing it would have passed.

## Amended acceptance test for "feat(director-kit): D1 · chalk harness — the kit made visible"

- _when:_ 2026-07-17T12:48:52.913Z
- _why:_ Review low: assert the secondary harness rows (retro agent, held-out + require-test checks) so a regression on those config keys is caught, not just the core rows.

## Released v0.1.1

- _when:_ 2026-07-17T13:21:18.294Z
- _why:_ Completion marker for the orphaned chore(release): v0.1.1 commit (18b8ef0): that cycle was superseded by the shipped+tagged v0.2.0, which carried its content to npm. Marked complete so the release orphan-recovery does not resume it (tagging the old tree would publish a stale 0.1.1).

## Released v0.3.0

- _when:_ 2026-07-17T13:25:43.013Z
- _why:_ 66 change(s); promoted dev→main (PR already merged); tagged v0.3.0 on main

## Overrode review gate for "design: specify Agent Adapter Protocol v1 and canonical role contracts"

- _when:_ 2026-08-03T06:54:55.872Z
- _why:_ User explicitly directed bypassing external model review for now; configured Claude model is unavailable, and milestone #5 is replacing provider-specific review wiring with provider-agnostic adapters.

## Amended acceptance test for "refactor: introduce the Agent Runner seam and migrate executor + planner"

- _when:_ 2026-08-03T07:07:53.975Z
- _why:_ Move the fake executable outside Node's default test discovery tree; the original location caused the full suite to execute the fixture as a test and wait on stdin.

## Amended acceptance test for "refactor: introduce the Agent Runner seam and migrate executor + planner"

- _when:_ 2026-08-03T07:08:13.669Z
- _why:_ Update the test fixture path after moving the fake executable outside Node's default test discovery tree.

## Route executor and planner through a single normalized Agent Runner result, while retaining legacy command strings as a compatibility transport.

- _when:_ 2026-08-03T07:10:08.312Z
- _why:_ This removes child-process and provider decisions from workflow modules, preserves streaming and #99 accounting, and gives later provider adapters one stable seam.

## Overrode review gate for "refactor: introduce the Agent Runner seam and migrate executor + planner"

- _when:_ 2026-08-03T07:12:11.131Z
- _why:_ User explicitly directed bypassing external model review for this milestone; the implementation is protected by a locked fake-agent suite and the full Chalk verification gate is GREEN.

## Make Agent Runner the sole owner of subprocess normalization and cost-ledger timing for every agent-backed role.

- _when:_ 2026-08-03T07:20:25.624Z
- _why:_ Role modules should only build prompts and parse normalized text; central execution preserves legacy behavior while making provider adapters replaceable without touching workflows.

## Overrode review gate for "refactor: route every remaining agent-backed stage through Agent Runner"

- _when:_ 2026-08-03T07:22:25.998Z
- _why:_ User explicitly directed bypassing external model review for this milestone; every migrated role is covered by one locked fake-agent seam and the repository-wide Chalk verify gate is GREEN.

## Migrated spine 1.1 → 1.2

- _when:_ 2026-08-03T07:30:04.019Z
- _why:_ chalk migrate: add provider-neutral agent profiles and role bindings (backup: /Users/devid/Documents/projects/personal/startup/chalk/chalk-protocol/.chalk/backups/2026-08-03T07-30-04-016Z)

## Keep legacy command values live and synthesize compatibility profiles at resolution time instead of copying them during schema migration.

- _when:_ 2026-08-03T07:34:57.878Z
- _why:_ This makes migration additive and idempotent, preserves user edits indefinitely, and lets explicit named profiles take over role-by-role without a flag day.

## Overrode review gate for "feat: add provider-neutral agent profiles, role bindings, and explicit identity"

- _when:_ 2026-08-03T07:37:11.406Z
- _why:_ User explicitly directed bypassing external model review for this milestone; profiles, migration, identity, legacy compatibility, config drift, and credential-safe doctor output are locked by tests and full verify is GREEN.

## Amended acceptance test for "refactor: introduce the Agent Runner seam and migrate executor + planner"

- _when:_ 2026-08-03T07:40:44.383Z
- _why:_ Protocol capability enforcement extends the normalized Agent Runner result with a capabilities field; update the earlier seam contract without weakening its existing assertions.

## Amended acceptance test for "refactor: introduce the Agent Runner seam and migrate executor + planner"

- _when:_ 2026-08-03T07:40:55.966Z
- _why:_ Lock the evolved Agent Runner result contract after adding the capabilities field required by Protocol v1.

## Enforce read-only roles with net workspace content snapshots and centralize structured decoding in Agent Runner.

- _when:_ 2026-08-03T07:51:45.314Z
- _why:_ Adapter claims alone cannot protect the workspace; Chalk can independently refuse mutated results, preserve user data, and give every provider the same role-schema diagnostics.

## Overrode review gate for "feat: enforce agent role capabilities and structured-output contracts"

- _when:_ 2026-08-03T07:54:13.722Z
- _why:_ User explicitly directed bypassing external model review for this milestone; capability enforcement, malicious read-only mutation refusal, structured schemas, diagnostics, and executor access are protected by locked tests and full verify is GREEN.

## Keep provider-neutral canonical role instructions separate from run context and generate native assets from that source.

- _when:_ 2026-08-03T08:07:18.086Z
- _why:_ Adapters can map the two fields to native system/user prompt surfaces or combine them for raw CLIs, while generated conveniences cannot become runtime dependencies or drift.

## Overrode review gate for "refactor: make Chalk role instructions provider-neutral"

- _when:_ 2026-08-03T08:09:53.849Z
- _why:_ User explicitly directed bypassing external model review for this milestone; all nine canonical roles, instruction/context separation, generated-asset drift, raise behavior, and decision-digest behavior are protected by locked tests and full verify is GREEN.

## Treat raw-command versus Protocol v1 as the only Agent Runner transport seam; put each provider's flags, permissions, prompt mapping, output decoding, usage, identity, and redaction behind its adapter command.

- _when:_ 2026-08-03T08:28:57.992Z
- _why:_ This keeps the core interface small and provider-neutral while concentrating provider volatility in deep adapters that can be tested through the same request/response contract.

## Overrode review gate for "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"

- _when:_ 2026-08-03T08:31:15.926Z
- _why:_ User explicitly directed bypassing external model review for this milestone; the locked adapter test covers provider ownership, compatibility, normalized identity/usage, redaction, core neutrality, and package assets, and full verify is GREEN.

## Use one public offline fixture convention and one conformance harness for built-in, raw-command, fake, and external Protocol v1 adapters.

- _when:_ 2026-08-03T08:41:14.004Z
- _why:_ Adapter authors can prove transport and failure semantics without credentials or paid model calls, while --live remains an explicit bounded smoke mode rather than an accidental network path.

## Overrode review gate for "feat: ship an Agent Adapter Protocol conformance kit"

- _when:_ 2026-08-03T08:43:38.665Z
- _why:_ User explicitly directed bypassing external model review for this milestone; the locked conformance test covers all fixtures, built-in and external adapters, mutation refusal, offline/live policy, both renderers, version reporting, docs, package assets, and full verify is GREEN.

## Ship Codex and Gemini as Protocol v1 adapters with provider-native sandbox, structured-output, and telemetry mappings

- _when:_ 2026-08-03T08:56:30.613Z
- _why:_ The common adapter contract keeps workflow code provider-neutral while direct argv/stdin transport preserves prompts and leaves authentication with each installed CLI.

## Overrode review gate for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-08-03T08:58:51.137Z
- _why:_ Milestone owner explicitly authorized bypassing external model reviewers for this milestone; locked acceptance test and full verify are GREEN.

## Keep guided setup provider-neutral by discovering adapter-owned manifests and applying idempotent connection presets

- _when:_ 2026-08-03T09:13:55.694Z
- _why:_ The connect module can validate and bind any manifest without provider branches, preserves existing profiles and legacy commands by default, and requires explicit flags for replacement, migration, or a live model call.

## Overrode review gate for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-03T09:19:31.693Z
- _why:_ Milestone owner explicitly authorized bypassing external model reviewers for this milestone; locked acceptance test and full verify are GREEN.

## Prioritize one exact next command while retaining full queue detail behind verbose and stable JSON

- _when:_ 2026-08-03T09:35:01.414Z
- _why:_ The default human view should guide action rather than front-load blocked history; category counts preserve orientation, verbose preserves every item, and machine consumers keep their existing shape.

## Overrode review gate for "ux: make chalk next and doctor concise, prioritized, and profile-aware"

- _when:_ 2026-08-03T09:37:25.751Z
- _why:_ Milestone owner explicitly authorized bypassing external model reviewers for this milestone; locked acceptance test and full verify are GREEN.

## Overrode review gate for "docs: publish the provider-neutral quickstart, migration guide, and adapter-author guide"

- _when:_ 2026-08-03T09:53:09.076Z
- _why:_ Director explicitly authorized bypassing external model review for this milestone; locked acceptance test and full chalk verify are GREEN.

## Published provider-neutral onboarding and adapter documentation

- _when:_ 2026-08-03T09:53:16.960Z
- _why:_ Make init → connect → doctor → run the default autonomous path while preserving manual and raw-command compatibility.

## Amended acceptance test for "refactor: make Chalk role instructions provider-neutral"

- _when:_ 2026-08-04T11:59:43.768Z
- _why:_ Issue #240 clarifies the compatibility boundary: Protocol v1 adapters receive separate instructions and context, while legacy raw commands must receive the caller context byte-for-byte without a Chalk-owned prompt prefix.

## Amended acceptance test for "refactor: make Chalk role instructions provider-neutral"

- _when:_ 2026-08-04T12:00:03.153Z
- _why:_ Relock the amended regression: legacy raw commands receive only the exact caller context; Protocol v1 remains the separate instructions/context interface.

## Keep legacy raw-command stdin byte-compatible and reserve canonical instruction delivery for Protocol v1 adapters

- _when:_ 2026-08-04T12:04:38.788Z
- _why:_ Raw commands are an existing public compatibility surface with arbitrary prompt contracts; prepending Chalk text changes behavior and can corrupt structured inputs.

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T12:12:38.241Z
- _why:_ Issue #241 tightens connect's independence contract: different providers/models are not proof without explicit opaque keys.

## Amended acceptance test for "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"

- _when:_ 2026-08-04T12:12:38.295Z
- _why:_ Issue #241 forbids first-party adapters from deriving independenceKey from provider/model values while retaining opaque model metadata.

## Amended acceptance test for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-08-04T12:12:38.348Z
- _why:_ Issue #241 requires Codex and Gemini identity tests to reject inferred independence keys while preserving reported/configured model metadata.

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T12:14:08.210Z
- _why:_ Relock connect coverage for explicit-only reviewer independence and accurate remediation.

## Amended acceptance test for "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"

- _when:_ 2026-08-04T12:14:08.264Z
- _why:_ Relock Claude/OpenCode adapter identity coverage after removing provider/model-derived independence keys.

## Amended acceptance test for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-08-04T12:14:08.318Z
- _why:_ Relock Codex/Gemini identity coverage after preserving opaque model metadata without inferred independence.

## Treat reviewer independence as an explicit attestation, never an inference from provider or model labels

- _when:_ 2026-08-04T12:18:31.663Z
- _why:_ Provider and model strings do not prove separate failure modes, accounts, deployments, or model families; only opaque independently verified keys support a same/distinct claim.

## Amended acceptance test for "fix(agent-runner): detect ignored-file mutations in read-only roles"

- _when:_ 2026-08-04T12:24:11.719Z
- _why:_ Strengthen #242 coverage to distinguish clean tracked mutation from mutation of a file already dirty before the read-only agent starts.

## Amended acceptance test for "fix(agent-runner): detect ignored-file mutations in read-only roles"

- _when:_ 2026-08-04T12:25:00.665Z
- _why:_ Relock the complete snapshot contract covering clean tracked, pre-dirty tracked, ordinary untracked, and ignored paths.

## Index workspace snapshots through Git while hashing path contents with lstat

- _when:_ 2026-08-04T12:28:22.549Z
- _why:_ Three Git inventories cover tracked, ordinary untracked, and ignored files without a general recursive scan; exclusion pathspecs protect .git, node_modules, and held-out tests, while lstat hashes symlinks without following external targets.

## Amended acceptance test for "feat: ship an Agent Adapter Protocol conformance kit"

- _when:_ 2026-08-04T12:44:08.127Z
- _why:_ Issue #243 separates production-refusal proof from adapter compliance: the mutation fixture passes on the shared enforcement result, while a direct ok claim is an overall adapter violation.

## Amended acceptance test for "feat: ship an Agent Adapter Protocol conformance kit"

- _when:_ 2026-08-04T12:45:46.838Z
- _why:_ Relock conformance coverage for the shared production refusal seam and explicit adapter-violation reporting.

## Separate enforcement-fixture success from adapter conformance success

- _when:_ 2026-08-04T12:53:06.491Z
- _why:_ Chalk must prove its production refusal catches mutations, but that proof cannot certify an adapter that falsely returned ok; a separate adapterViolation signal preserves both truths.

## Amended acceptance test for "feat: enforce agent role capabilities and structured-output contracts"

- _when:_ 2026-08-04T12:59:00.768Z
- _why:_ Provider-neutral adapter transport changed the malicious fixture invocation while preserving the locked capability/refusal contract; record and relock the shipped milestone test.

## Amended acceptance test for "feat: enforce agent role capabilities and structured-output contracts"

- _when:_ 2026-08-04T12:59:00.837Z
- _why:_ Read-only reviewer enforcement requires capture instrumentation outside the reviewed workspace; record the already-shipped test adjustment without weakening no-diff behavior.

## Amended acceptance test for "fix: sameModelFamily can't see env-var models (CHALK_OPENCODE_MODEL) — cross-model warning inert for opencode"

- _when:_ 2026-08-04T12:59:00.891Z
- _why:_ Protocol v1 supersedes environment-derived model-family inference: environment model strings must not become reviewer independence identity.

## Amended acceptance test for "fix: review diff-capture silently passes on no diff — abort loudly instead of a vacuous verdict (#151)"

- _when:_ 2026-08-04T12:59:00.945Z
- _why:_ Relock the no-diff regression after moving fake reviewer instrumentation outside the read-only workspace; assertions remain equivalent.

## Preserve #227-#238 as honestly hand-landed instead of falsifying retroactive pipeline stages

- _when:_ 2026-08-04T12:59:00.991Z
- _why:_ Those completed tasks were committed before the GitHub pipeline was used. The four promotion blockers #240-#243 were subsequently landed through scoped PRs with CI and recorded review; historical stage metadata remains truthful.

## Overrode review gate for "test: validate the provider-neutral release candidate locally"

- _when:_ 2026-08-03T11:38:38.428Z
- _why:_ Director requested an offline release-candidate smoke with no model calls; npm pack/install, 75 offline conformance cases, installed manual lifecycle, and full repository verify are GREEN.

## Overrode review gate for "release: prepare v0.4.0 locally"

- _when:_ 2026-08-03T12:34:37.472Z
- _why:_ Director requested local-only v0.4.0 release preparation with no model calls; versioned offline pack/install, installed CLI smoke, 75 conformance cases, and full repository verify are GREEN.

## Restore the canonical v0.4.0 resume marker after PR #248

- _when:_ 2026-08-04T15:17:46.398Z
- _why:_ The merge commit body matched release recovery grep before the preserved marker, while its subject was not a release marker; a fresh exact marker on dev makes the documented resume path deterministic without rewriting package or changelog artifacts.

## Released v0.4.0

- _when:_ 2026-08-04T15:25:37.133Z
- _why:_ 18 change(s); promoted dev→main via PR #249; tagged v0.4.0 on main

## Amended acceptance test for "feat: ship an Agent Adapter Protocol conformance kit"

- _when:_ 2026-08-04T21:27:02.515Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-08-04T21:27:02.629Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-08-04T21:27:02.739Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"

- _when:_ 2026-08-04T21:27:02.854Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "feat: ship an Agent Adapter Protocol conformance kit"

- _when:_ 2026-08-04T21:27:46.363Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-08-04T21:27:46.419Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-08-04T21:27:46.474Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "refactor: move Claude and OpenCode behavior behind Agent Adapter Protocol v1"

- _when:_ 2026-08-04T21:27:46.532Z
- _why:_ Use the shared cross-platform launcher so npm package checks execute on Windows

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-08-04T21:30:37.037Z
- _why:_ Give npm packing an isolated writable cache and use the cross-platform launcher

## Amended acceptance test for "feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable"

- _when:_ 2026-08-04T21:56:22.734Z
- _why:_ Use the platform PATH delimiter for the portable fake provider

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T21:56:22.785Z
- _why:_ Replace the POSIX shell fake CLI with a portable Node fixture

## Amended acceptance test for "fix(agents): keep reviewer independence unverified unless explicit"

- _when:_ 2026-08-04T21:56:22.838Z
- _why:_ Replace the POSIX shell fake CLI with a portable Node fixture

## Amended acceptance test for "feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)"

- _when:_ 2026-08-04T21:56:22.890Z
- _why:_ Replace shell-parsed Git and bash merge setup with argv-based Node fixtures

## Amended acceptance test for "fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips"

- _when:_ 2026-08-04T21:56:22.942Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-08-04T21:56:22.995Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "fix: release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md"

- _when:_ 2026-08-04T21:56:23.045Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable"

- _when:_ 2026-08-04T21:58:21.350Z
- _why:_ Use the platform PATH delimiter for the portable fake provider

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T21:58:21.411Z
- _why:_ Replace the POSIX shell fake CLI with a portable Node fixture

## Amended acceptance test for "fix(agents): keep reviewer independence unverified unless explicit"

- _when:_ 2026-08-04T21:58:21.470Z
- _why:_ Replace the POSIX shell fake CLI with a portable Node fixture

## Amended acceptance test for "feat: chalk release --promote — protected-main release flow (promotion PR + tag on main's tip)"

- _when:_ 2026-08-04T21:58:21.524Z
- _why:_ Replace shell-parsed Git and bash merge setup with argv-based Node fixtures

## Amended acceptance test for "fix: release --commit partial-failure recovery — a post-commit tag failure leaves an untagged release commit, and a re-run version-skips"

- _when:_ 2026-08-04T21:58:21.577Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"

- _when:_ 2026-08-04T21:58:21.630Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "fix: release --commit/--promote orphan recovery keys on an un-namespaced "Released vX" substring over decisions.md"

- _when:_ 2026-08-04T21:58:21.685Z
- _why:_ Run Git revision assertions through argv so cmd.exe cannot consume caret syntax

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T22:28:12.005Z
- _why:_ Adversarial review found the Windows exclusion contract could be bypassed by aliases, inverse guards, or conditional test.skip without an adjacent tracked issue reason; strengthen the locked contract without adding any skips

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T22:32:37.492Z
- _why:_ Re-lock the strengthened adversarial-review contract after adding bypass detection for aliases, inverse platform guards, conditional skip options, and unconditional skipped tests

## Amended acceptance test for "fix(conformance): refuse adapters that mutate read-only workspaces"

- _when:_ 2026-08-04T22:47:57.027Z
- _why:_ Windows CI still reports the mutation-refusal fixture as failing without surfacing the conformance result detail; include the observed detail in the assertion so the portable production seam can be diagnosed from CI evidence

## Amended acceptance test for "fix(conformance): refuse adapters that mutate read-only workspaces"

- _when:_ 2026-08-04T22:48:41.438Z
- _why:_ Re-lock the mutation-refusal test after adding its result detail to the assertion message for Windows CI diagnostics

## Amended acceptance test for "fix(conformance): refuse adapters that mutate read-only workspaces"

- _when:_ 2026-08-04T22:50:44.889Z
- _why:_ Windows diagnosis identifies the generated ESM fixture importing a native drive path; convert the fixture import to a file URL so the production refusal seam is actually exercised on Windows

## Amended acceptance test for "fix(conformance): refuse adapters that mutate read-only workspaces"

- _when:_ 2026-08-04T22:50:58.136Z
- _why:_ Re-lock the mutation-refusal test after making its generated module import a Windows-safe file URL

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T23:33:58.942Z
- _why:_ Windows full-suite saturation exposed that the adapter probe timeout is a correctness boundary; pin the bounded 10-second spawn option so reverting to the flaky 2-second window fails deterministically.

## Amended acceptance test for "feat: add chalk connect for guided agent setup and role assignment"

- _when:_ 2026-08-04T23:34:25.113Z
- _why:_ Re-lock the sanctioned adapter probe contract after adding the deterministic 10-second timeout assertion required by final standards review.

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T23:35:11.551Z
- _why:_ Final adversarial review found the Windows exclusion guard missed nested test files, shorthand skip options, and t.skip calls; strengthen the locked contract with explicit self-tests for those bypasses.

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T23:36:55.874Z
- _why:_ Re-lock the Windows CI contract after adding recursive scan coverage and deterministic bypass fixtures for shorthand skip options and platform-gated test-context skips.

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T23:41:56.291Z
- _why:_ Spec re-review found the recursion fixture compared native Windows separators to a protocol-style forward-slash expectation; normalize its relative paths before assertion.

## Amended acceptance test for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-04T23:42:10.161Z
- _why:_ Re-lock the sanctioned Windows exclusion contract after normalizing recursive fixture paths to forward slashes.

## Overrode review gate for "ci: add a windows-latest lane and fix what breaks"

- _when:_ 2026-08-05T00:05:31.984Z
- _why:_ The configured reviewer invokes Claude, which this handover explicitly prohibits. Two independent local Codex reviews covered documented standards and the locked Issue #84/task spec; every blocking finding was fixed, re-reviewed, and the exact final SHA passed complete Ubuntu and Windows CI.

## Native Windows support uses one argv-first process seam and forward-slash protocol paths

- _when:_ 2026-08-05T00:05:41.296Z
- _why:_ Structured Git, GitHub, npm, and agent calls must avoid shell quoting; Node scripts launch through process.execPath, Windows cmd/bat shims resolve explicitly, free-form hooks alone use the native shell, and persisted paths normalize to forward slashes while filesystem I/O remains native.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T00:16:31.110Z
- _why:_ Native Windows CI exposed an intermittent lost update under 16 concurrent task writers; pin the portable atomic-directory lock representation and child exit success so the concurrency guarantee is deterministic.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T00:19:26.794Z
- _why:_ Re-lock the sanctioned concurrency contract after adding deterministic child-exit diagnostics and the atomic-directory lock assertion.

## Cross-process spine writes use an atomic directory lock with owner tokens

- _when:_ 2026-08-05T00:23:11.956Z
- _why:_ Windows CI lost one of 16 concurrent task additions under the prior file-descriptor lock. Atomic directory creation provides a portable create-if-absent mutex; unique owner markers prevent a stale holder from deleting a replacement lock, and timeout now fails closed instead of writing unlocked.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T00:29:41.708Z
- _why:_ Re-lock after adding deterministic ABA coverage for serialized stale takeover and owner cleanup against a fresh replacement lock.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T00:43:35.841Z
- _why:_ Re-lock after replacing the crash-wedging transition claim with persistent generation tombstones and pinning delayed-actor ABA protection.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T01:53:21.751Z
- _why:_ Re-lock after pinning ownerless crash recovery, hard-link retirement ABA safety, and saturated-host acquisition timing.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:02:01.493Z
- _why:_ Re-lock after making persistent generation tombstones self-ignored in every freshly initialized Chalk spine.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:17:20.532Z
- _why:_ Re-lock after replacing pathname unlink with non-empty directory retirement and pinning the delayed-retirer ABA interleaving plus upgrade-safe runtime ignores.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:21:15.952Z
- _why:_ Re-lock after isolating retirement guards from unrelated .chalk/local runtime state while preserving upgrade-safe self-ignore behavior.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:31:32.192Z
- _why:_ Re-lock after pinning recovery from interrupted zero-byte owner and self-ignore writes.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:39:10.846Z
- _why:_ Re-lock after making owner observation race-free and zero-byte recovery bounded against synchronous spin regressions.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T02:44:26.985Z
- _why:_ Re-lock after polling the complete owner token rather than its pre-write directory entry.

## Spine lock generations retire by non-empty directory tombstone

- _when:_ 2026-08-05T02:48:11.383Z
- _why:_ Atomic rename to a persistent token-specific tombstone prevents delayed owners or stale waiters from deleting a replacement generation; ownerless and interrupted-write states recover fail-closed, and self-ignored guards keep upgraded repositories clean.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T03:00:19.483Z
- _why:_ Re-lock after converting inline ESM fixtures to portable file URLs, asserting writer execution, and handshaking the held lock.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T03:05:43.348Z
- _why:_ Re-lock after bounding and killing a holder that regresses into pre-handshake acquisition spin.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T03:20:28.878Z
- _why:_ Re-lock after capturing atomic-writer diagnostics and pinning successful execution under concurrent readers.

## Amended acceptance test for "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"

- _when:_ 2026-08-05T03:27:06.706Z
- _why:_ Re-lock after deterministically pinning Windows sharing retries, deadline expiry, immediate non-retryable failure, and no-delete atomicity.

## Amended acceptance test for "feat: prove adapter portability with first-party Codex and Gemini CLI adapters"

- _when:_ 2026-09-10T19:03:57.283Z
- _why:_ Update the locked adapter contract to find Codex's exec subcommand after newly required global approval flags.
