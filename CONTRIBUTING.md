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
