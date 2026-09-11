# Quickstart — zero to a gated task in ~10 minutes

Chalk is the provider-neutral referee around your coding agent. It owns the task state and gates;
the agent connection is replaceable. The autonomous happy path is **init → connect → doctor →
run**. You can also use every gate manually with no model at all.

## 0. Prerequisites

- Node 18.17+ on 18.x, or Node 20+, and git for the local loop (Chalk has zero runtime npm dependencies).
- One supported agent CLI for autonomous work: [Claude Code](./docs/integrations/claude-code.md),
  [OpenCode](./docs/integrations/opencode.md), [Codex CLI](./docs/integrations/codex.md), or
  [Gemini CLI](./docs/integrations/gemini-cli.md).
- Optional `gh` for the GitHub issue → PR → merge pipeline.

```sh
npm install -g chalk-protocol
```

## 1. Autonomous happy path

Initialize the project, connect installed agent CLIs, preflight the setup, then run:

```sh
cd your-project
chalk init --name your-app --goal "one sentence on what this is"
chalk connect --preset autonomous
chalk doctor

chalk task add "users can reset their password"
chalk spec <id> --criterion "a reset email is sent for a known address" --test test/reset.test.ts
chalk run
```

`chalk init` detects Node, Flutter/Dart, Python, or Go and fills the real verify commands.
`chalk connect` discovers installed CLIs offline and writes named profiles plus role bindings. It
does not log in, contact a model, or choose a commercial model for you. If several CLIs are
installed, select explicitly:

```sh
chalk connect --preset autonomous --builder codex --reviewer gemini
```

Use `chalk connect --dry-run` before retrofitting an existing project. Connect preserves existing
profiles, role bindings, and legacy commands unless you explicitly pass `--replace` or
`--migrate-legacy`. See [Connect](./docs/CONNECT.md), the
[capability matrix](./docs/PROVIDER_MATRIX.md), and the
[migration guide](./docs/MIGRATING_TO_AGENT_PROFILES.md).

`chalk doctor` groups setup blockers, warnings, and optional improvements. A clean autonomous
preflight means `chalk run` can drive each runnable task through executor → verify → review → done.
Use `chalk doctor --json` for automation and bug reports. The gates—not the model—decide whether
work advances.

## 2. Manual mode — no model required

Manual mode is a first-class workflow. Skip `chalk connect`; you write the change and Chalk holds
the same acceptance, verification, and test-integrity gates:

```sh
chalk init --name your-app --goal "one sentence on what this is"
chalk task add "users can reset their password"
chalk spec <id> --criterion "a reset email is sent for a known address" --test test/reset.test.ts
chalk start <id>
# ...write the code and test...
chalk verify
chalk done <id>
```

Run `chalk next` whenever you are unsure what to do. It prints one primary next action. The manual
loop remains valid even when `chalk doctor` says unattended agent readiness is incomplete.

Try the integrity gate deliberately: after the test is locked by `chalk spec`, edit it and run
`chalk verify`. Chalk reports `test-integrity VIOLATED`. The sanctioned path is
`chalk amend-spec <id> --test <path> --why "..."`, which records the reason and invalidates stale
review evidence.

## 3. Verify configuration

If Chalk cannot detect a stack, it warns that verification would be vacuous. Supply a real command:

```sh
chalk init --verify-test "make check"
# or acknowledge an intentionally empty configuration:
chalk init --bare
```

Common diagnostics:

| Symptom | Meaning | Next action |
|---|---|---|
| `VACUOUS` on verify | no gate command ran | set `protocol.verify.test` |
| no executor role | manual mode works; autonomous mode is unwired | run `chalk connect` |
| CLI missing or auth unknown | provider setup is incomplete | use the exact install/login action from `chalk connect --list` |
| reviewer independence unknown | Chalk has no explicit comparison identity | bind a distinct reviewer profile or configure opaque independence keys |
| plan not approved | the director checkpoint is enabled | run `chalk approve-plan <id>` after resolving its questions |

## 4. Explore safely

```sh
chalk demo
```

The demo uses local stub agents—no model, GitHub, or network—and shows both a plan refusal and a
tampered locked test being caught.

## 5. Where next

- [Configuration reference](./docs/CONFIG.md)
- [Running autonomously](./RUNNING-AUTONOMOUSLY.md)
- [Provider capability matrix](./docs/PROVIDER_MATRIX.md)
- [Migrating legacy commands](./docs/MIGRATING_TO_AGENT_PROFILES.md)
- [Writing an adapter](./docs/ADAPTER_AUTHOR_GUIDE.md)
- [Agent Adapter Protocol v1](./docs/AGENT_ADAPTER_PROTOCOL.md)
- [Why each gate exists](./PROTOCOL.md)
- Hit a rough edge? File a two-minute
  [friction report](https://github.com/chalkagents/chalk-protocol/issues/new?template=friction_report.yml).
