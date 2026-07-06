# Contributing to Chalk Protocol

Thanks for wanting to improve chalk. Two things make this repo unusual to contribute to, and both
work in your favor: there are **zero dependencies** (clone → `node --test`, nothing to install), and
**chalk builds itself** — every feature in this repo was shipped through chalk's own gated loop.

## The fast path

```sh
git clone https://github.com/chalkagents/chalk-protocol.git && cd chalk-protocol
node --test          # the whole suite, hermetic, no network — should be green before you start
```

Fix, add a test that **fails without your change**, open a PR. CI runs `node --test` on every PR.

## The native path (recommended for non-trivial changes)

This repo is driven by chalk itself — the `.chalk/` directory you see is our real, living project
state, not a fixture. You can ride the same loop:

```sh
npm link                                  # puts `chalk` on your PATH
chalk task add "fix: <what you're fixing>"
chalk spec <id> --criterion "<observable behavior>" --test test/<yours>.test.mjs
chalk start <id>     # refuses without criteria — that's the point
# ...write the code...
chalk verify         # the gate decides, not you
chalk done <id>
```

`chalk next` tells you what to do at any point. See [PROTOCOL.md](./PROTOCOL.md) for why the gates
refuse what they refuse.

## The dogfood sweep (how chalk ships chalk)

The default contribution path for batch work on this repo is chalk's own full loop, driven
against the live backlog — GitHub issues in, gate-merged PRs out. The committed
`.chalk/chalk.json` already wires every agent (executor/planner/reviewer/retro), so this runs
as-is:

```sh
chalk issue pull --limit 3     # newest open issues → tasks (criteria from their checklists)
chalk spec <id> --criterion …  # intake finishes at spec time; a task you can't spec is itself
                               #   a friction finding — file it
chalk autopilot --max 3        # the standard sweep unit: branch → work → verify → pr → review
                               #   → gated merge, per task (or drive stages by hand, same gates)
chalk retro                    # close the loop: lessons appended, friction filed as new issues
chalk cost                     # what the sweep consumed — tokens per stage, overhead share
chalk stats                    # what the gates caught — review catches, churn, and the
                               #   gate-vs-bypass fraction over done tasks
```

Ground rules that make the sweep honest: **PRs target `dev`** (`main` is deploy-only, promoted
via `chalk release --promote`); **issue-backed tasks go through the pipeline** — hand-commits
skip the landing gate and leave the pipeline stages stale; every merged PR cross-references its
issue and carries the gate trail (verify green, adversarial review verdict, LGTM). See
[RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md) for the unattended version (cron,
`chalk loop`, convergence).

Receipts, not claims — from the 2026-07-06 sweeps that dogfooded this loop:

- **Issues in → gate-merged PRs out:** #89→PR #94, #88→PR #95, #85→PR #96, #91→PR #100,
  #98→PR #103, #102→PR #104, #99→PR #105, #78→PR #109 — each PR's squash commit carries
  `Closes #<issue>` and the adversarial-review verdict is posted on the PR thread.
- **Retro closes the loop:** issue #107 was filed by `chalk retro` at the end of the sweep —
  its body opens "Three reviews in this sweep independently flagged the same hole" and is
  signed "_filed by `chalk retro` (self-healing)_".
- **The claim is auditable, not asserted** — `chalk stats` on this repo's spine (2026-07-06):

  ```
  landing · 59 done task(s) — gate vs bypass
  gated      57/59 (97%) passed adversarial review
  overridden  2/59 (3%)  review gate overridden (--force-review)
  pipeline   19/59 (32%) landed via PR + gated merge (rest hand-landed)
  ```

  Rerun `chalk stats` anytime for the live numbers (the snapshot above is dated, the command
  is the source of truth); the two overrides are logged decisions, visible in
  `.chalk/decisions.md` — bypasses are counted, never hidden.

## Rules the gates will hold you to anyway

- **A behavior change ships a test, and the test fails without the change.** A test that passes on
  the pre-change code asserts nothing (we call this the break-it rule; CI reviewers check for it).
- **Never edit a locked test to make a gate pass.** Files listed under a task's `tests` are
  read-only; the sanctioned path to change one is `chalk amend-spec <id> --test <path> --why "..."`.
- **Never read or edit `.chalk/held-out/`.** It's the blind regression set; touching it defeats P7.
- **Small, scoped diffs.** One task, one concern, one PR.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`…) — the changelog is generated from them.

## What to work on

Issues labeled [`good-first-issue`](https://github.com/chalkagents/chalk-protocol/issues?q=is%3Aissue+is%3Aopen+label%3Agood-first-issue)
and [`help-wanted`](https://github.com/chalkagents/chalk-protocol/issues?q=is%3Aissue+is%3Aopen+label%3Ahelp-wanted)
are scoped for outside contributors. Friction reports (where chalk confused you) are contributions
too — often the most valuable ones.

## Conduct & security

Be kind ([CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)). Report vulnerabilities privately
([SECURITY.md](./SECURITY.md)) — especially anything that lets an agent defeat a gate.
