# Quickstart — zero to a gated task in ~10 minutes

Chalk is the referee, not the coder: every step below ends at a **gate that refuses** until a
fundamental is met. You can drive the loop yourself (no LLM anywhere) or wire an agent — the gates
are identical either way.

## 0. Prerequisites

- **Node ≥ 18** and **git** — that's it for the local loop (chalk has zero npm dependencies).
- Optional, only for specific features: `gh` (GitHub issue→PR→merge pipeline), the `claude` CLI or
  [opencode](./docs/integrations/opencode.md) (autonomous executor/reviewer).

```sh
npm install -g chalk-protocol     # or: npx chalk-protocol <cmd>
```

## 1. Watch it first (1 minute, nothing to configure)

```sh
chalk demo
```

Stub agents run the whole lifecycle on a throwaway project. Watch for the two **refusals** — work
before plan approval, and a tampered **locked test** caught by P6 (`test-integrity VIOLATED`).
That second one is chalk's core promise: an agent can't quietly weaken the test that judges it.

## 2. Init your project

```sh
cd your-project
chalk init --name your-app --goal "one sentence on what this is"
```

Chalk auto-detects your stack (package.json → node, pubspec.yaml → flutter, go.mod → go,
pyproject.toml/requirements.txt → python) and fills `protocol.verify` with real commands — plus
`breakTest` where the stack has a truthful per-file test runner.

No detectable stack? You'll get a **loud warning** that verify would pass *vacuously* (green while
checking nothing). Fix it inline:

```sh
chalk init --verify-test "make check"     # or edit .chalk/chalk.json → protocol.verify.test
chalk init --bare                         # or: acknowledge an intentionally empty verify
```

## 3. Manual mode — you code, chalk gates

```sh
chalk task add "users can reset their password"
chalk spec <id> --criterion "a reset email is sent for a known address" --test test/reset.test.ts
chalk start <id>        # P1: refuses until the task has criteria — try it empty and see
# ... write the code and the test ...
chalk verify            # runs YOUR toolchain; loop until GREEN (a vacuous green is labeled)
chalk done <id>         # refuses unless verify is green + locked tests untouched
```

Two things worth trying on purpose:

- **Edit `test/reset.test.ts` after `spec --test` locked it**, then run `chalk verify` — RED,
  `test-integrity VIOLATED (P6)`. The only sanctioned way to change a locked test is
  `chalk amend-spec <id> --test <path> --why "..."` (logged, and it invalidates a prior review).
- **Run `chalk next` whenever you're lost** — it always names the single next action.

## 4. Claude Code mode — an agent codes, chalk still gates

```sh
chalk init --executor claude      # new project (or retrofit: chalk agents --claude)
chalk run                         # unattended: executor → verify → review → done, per task
```

`--executor claude` installs four agent definitions into `.claude/agents/` (executor, read-only
planner, **adversarial reviewer**, retro) and wires their commands — including a **required
per-task review**: the reviewer's job is to *refute* the change, and `done` won't pass without its
verdict. Details + permission modes + cross-model reviewer advice:
[docs/integrations/claude-code.md](./docs/integrations/claude-code.md).

## 5. Preflight & troubleshooting

```sh
chalk doctor            # readiness for UNATTENDED runs; the manual loop works regardless
chalk doctor --json     # paste this into bug reports
```

| Symptom | Meaning | Fix |
|---|---|---|
| `⚠ VACUOUS` on a green verify | no verify commands configured | `protocol.verify.test` in `.chalk/chalk.json` |
| `gh not found …` | GitHub CLI missing — only the issue/PR pipeline needs it | per-OS hint is in the message |
| `no protocol.executor.command` | autonomous mode unwired — manual loop unaffected | `chalk init --executor claude\|opencode`, or ignore |
| `break-it probe INCONCLUSIVE` | your `breakTest` command couldn't run | check the template is on PATH |
| `plan not approved` | the human checkpoint is on (`plan.required`) | `chalk approve-plan <id>` after answering questions |

## 6. Where to next

- **Autonomy & the GitHub pipeline** (issues → branches → PRs → gated merges):
  [RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md)
- **Every config key**: [docs/CONFIG.md](./docs/CONFIG.md)
- **Why each gate exists** (the research): [PROTOCOL.md](./PROTOCOL.md) · [RESEARCH.md](./RESEARCH.md)
- Stuck or confused? File a two-minute
  [friction report](https://github.com/chalkagents/chalk-protocol/issues/new?template=friction_report.yml) —
  it's the feedback we want most.
