# Chalk Protocol

A **director's harness for coding agents**: a durable `.chalk/` project spine + a CLI that drives
any agent (Claude Code, Codex, Gemini CLI, opencode) through a **read → work → verify → write**
loop — where **your intent, taste, and judgment are first-class** and the agent surfaces the
decisions that need you instead of one-shotting past them.

Chalk **does not write code** — your agent does. Chalk owns the state, the gates, and the
decisions: the steps [the evidence](./RESEARCH.md) says autonomous agents skip on their own.
Frontier models can't reliably self-certify "done"; given access to the tests that judge them
they cheat ~half the time; and mid-task they silently resolve the judgment calls that were yours
to make. So Chalk makes "done" rest on an **external check, never the agent's word** — and makes
the agent's judgment calls **yours to accept or redirect**.

> **BYO agent.** Connect Claude Code, OpenCode, Codex CLI, Gemini CLI, or any Protocol v1/raw-command
> adapter; you direct — Chalk carries your judgment into the work. **The agent never
> self-declares success — the gate decides.** *You can't direct what you can't verify.*

**Website:** [protocol.chalkagents.com](https://protocol.chalkagents.com) — the protocol in one page.

---

## See it refuse in 60 seconds

```sh
npx chalk-protocol demo        # or: chalk demo, once installed
```

![chalk demo — the full gated lifecycle, including two refusals](./docs/assets/demo.gif)

A throwaway project + stub agents (no LLM, no GitHub, no network) runs the **entire lifecycle** —
discover → plan → work → verify → review → done → release → feedback → portal — and stages the two
moments that make chalk chalk:

1. `chalk work` is **REFUSED** until a human approves the plan;
2. a "sneaky agent" edits a **locked** acceptance test → `chalk verify` goes RED with
   `test-integrity VIOLATED (P6)` — the tamper is caught, on screen.

~1 minute, cleans up after itself (`--keep` to poke around). Run `chalk connect` to replace the
stubs with an installed agent CLI and use the same loop for real.

---

## Install

```sh
npm install -g chalk-protocol       # puts `chalk` on your PATH (Node ≥ 18, zero dependencies)
# or try it without installing:  npx chalk-protocol demo
# or from source:                git clone https://github.com/chalkagents/chalk-protocol && cd chalk-protocol && npm link
npm test                            # (source checkout) run the suite — hermetic, no network
```

### Platform support

Chalk supports Linux and Windows, and the complete `node --test` suite runs on both
`ubuntu-latest` and `windows-latest` for every pull request and push to `dev` or `main`.
macOS is supported on a best-effort basis but is not currently a required CI lane.

---

## First real task in ~10 minutes

Run these in **your** project ([QUICKSTART.md](./QUICKSTART.md) is the full walkthrough, including
the no-LLM manual mode):

```sh
chalk init --name myapp --goal "what we're building"
#   auto-detects your stack (node/flutter/dart/python/go) and fills the verify commands;
#   no provider or model is selected by default

chalk connect --preset autonomous
#   discovers installed CLIs offline and binds provider-neutral profiles and roles

chalk doctor
#   preflights verification, agent capabilities, permissions, and reviewer independence

chalk task add "implement X"
chalk spec <id> --criterion "X does Y" --test test/x.test.ts   # criteria + LOCK the test (P2)
chalk run                 # executor → verify → review → done for each runnable task
```

`chalk init` also writes the protocol contract into `AGENTS.md`/`CLAUDE.md` so agent CLIs auto-load
it and drive themselves via `chalk next`. Lost at any point? `chalk next` names the one next action.
The [manual quickstart](./QUICKSTART.md#2-manual-mode--no-model-required) uses the same gates with no
model or agent CLI.

## The gates (why it's more than a notepad)

Each gate *refuses to advance* unless a fundamental is met (full model: [PROTOCOL.md](./PROTOCOL.md)):

| Gate | Refuses unless… |
|------|-----------------|
| `start` (P1) | the task has machine-checkable acceptance criteria |
| `done` (P4) | `chalk verify` (test/lint/typecheck/build) is green |
| `done` (P6) | the **locked** acceptance tests are byte-for-byte unchanged |
| `done` (P5) | an **adversarial review** passed — catches *verify-green-but-the-test-was-inadequate* (overridable, logged) |
| `work` | a feature ships a test (lever 1) that **fails without the change** (lever 3, on by default for stacks with a truthful per-file runner) — no vacuous passes |
| `phase` (P7) | a **held-out** regression audit (which the implementing agent never reads) is green & fresh |
| `amend-spec` (P6) | a locked-test change is explicit + reason-logged — the only sanctioned way to edit one |

And the traps are labeled: an empty verify prints `⚠ VACUOUS`, an unrunnable break-it/mutation
probe prints `INCONCLUSIVE` instead of silently passing, and a truncated review diff says so.

## Direct, don't babysit (the empty middle)

Every AI coding tool gates the *plan* and the *PR*. Nobody owns the **middle** — the judgment
calls an agent silently resolves *while* building. That's where "technically passed the tests,
wrong product" comes from. Chalk owns it:

| Mechanism | What it does |
|-----------|--------------|
| `chalk align <id>` | you accept the criteria as *the definition of done* **before** the agent builds (opt-in: `protocol.director.required`) |
| `chalk raise "<fork>"` | mid-work, the agent **raises** a fork that needs your taste instead of guessing — the task pauses until you answer |
| decision digest | the reviewer surfaces the judgment calls the agent made — each with blast-radius × reversibility — even on a PASS |
| `chalk pending` | your inbox: raised forks + med/high-risk calls, ranked. `accept`, `redirect "<do this instead>"`, or `answer` each |
| the loop closes | a redirect **re-opens the task** and the agent rebuilds to your call; your decisions **compound** into every future task's context |

![the director's harness — align → raise → digest → pending → rebuild → compound](./docs/assets/director-harness.gif)

`chalk harness` shows the kit assembled around your goal — agents · skills · checks · flows —
and `chalk skill add` teaches the project your playbook. Full framing: [docs/harness.md](./docs/harness.md).
Run it yourself, offline, in ~2 minutes: `bash docs/demo/director-harness-demo.sh`.

## Autonomous mode

```sh
chalk init                # initialize the protocol spine and verification commands
chalk connect             # discover and bind agent profiles; offline by default
chalk doctor              # resolve blockers before unattended work
chalk run                 # unattended: executor → verify → (review) → done, per runnable task
chalk issue pull          # import GitHub issues as tasks (BYO gh)
chalk pipeline            # per task: branch → plan → work → commit → PR → review-on-PR → LGTM → merge
```

At merge the pipeline requires what a careful human would: a recorded "what was done" in the PR
body, the reviewer's verdict + **LGTM posted on the PR**, and a **broke-check** (remote CI when the
PR has it — labeled when it falls back to local verify). Blocking reviews trigger a bounded
fix → re-verify → re-review loop; stuck tasks park with a **handoff** doc and the run keeps moving.
Full guide: [RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md).

Beyond the dev cycle, the loop closes end-to-end: `chalk discover` (brief → scoped backlog),
`chalk release` (notes + semver + tag), `chalk feedback` (signals → issues), `chalk retro`
(lessons + self-filed improvements), `chalk portal` (client-facing status), `chalk archive`
(compact a long-lived spine without losing history).

## Does the gate actually catch anything?

Chalk measures itself. `chalk stats` reports what its gates caught over your whole history
(live spine + archive) — review catches, churn made visible, gated-vs-bypassed landings.
`chalk stats --public` renders a **PII-free, shareable** version (no task titles, paths, or
ids) you can paste into a README — the quantified answer to "agents grade their own homework":

```bash
chalk stats --public     # a markdown block: "the adversarial gate caught N changes the model's self-check had passed"
chalk stats --badge      # shields.io endpoint JSON for a README badge
```

## How is this different?

| | Spec/scaffold tools (Spec-Kit, Kiro) | `AGENTS.md` alone | CI | **Chalk** |
|---|---|---|---|---|
| When it acts | before coding | advisory, every prompt | after the PR | **at every gate, in the loop** |
| Can the agent ignore it? | yes, after scaffold | yes (it's prose) | no, but too late | **no — commands refuse** |
| Test integrity | — | — | — | **SHA-locked tests + sanctioned amend path** |
| Judge of "done" | the agent | the agent | the suite the agent wrote | **external verify + independent adversarial review + held-out audit** |

The research behind each gate — agents gaming visible tests (~0 when isolated), same-model
reviewer self-preference, held-out gaps growing with code size — is collected in
[RESEARCH.md](./RESEARCH.md).

## Configuration

Everything lives in `.chalk/chalk.json` under `protocol`. Named profiles use Protocol v1 adapters;
legacy BYO commands remain supported through the raw-command compatibility path. `chalk init` fills
the verification essentials without choosing a provider. See **[docs/CONFIG.md](./docs/CONFIG.md)**,
the **[capability matrix](./docs/PROVIDER_MATRIX.md)**, and the
**[migration guide](./docs/MIGRATING_TO_AGENT_PROFILES.md)**.

```jsonc
{ "protocol": {
    "agents": {
      "version": 1,
      "profiles": {
        "builder": { "adapter": "raw-command", "command": "my-agent --write", "options": {} }
      },
      "roles": { "executor": "builder" }
    },
    "verify": { "test": "npm test" },
    "breakTest": "node --test {test}"
} }
```

## Telemetry (opt-in, off by default)

Chalk collects **nothing** unless you opt in. If you say yes to the one-time prompt at `chalk init`
(or set `protocol.telemetry.enabled: true`), it reports three anonymous activation **milestones** —
`init`, first green `verify`, first `done` — once each, with the chalk version and a random install
id. The **entire** payload is `event, version, installId, ts` — no code, paths, prompts, diffs, or
repo identity. It's fire-and-forget (never slows or fails a command). Run **`chalk telemetry --show`**
to see exactly what would be sent; hard-disable anytime with `CHALK_TELEMETRY=0` (it's also off on CI).
Details in [docs/CONFIG.md](./docs/CONFIG.md#telemetry).

## Status & feedback

Beta (protocol `chalk/0`), zero dependencies (Node ≥ 18), **dogfooded on itself** — every command
above was built through Chalk's own gated loop, and the `.chalk/` directory in this repo is our
real, living project state (yours will look like it). Enforces all seven primitives (P1–P7) plus
the agent contract and the full product lifecycle.

Trying chalk and hit a rough edge? A two-minute
**[friction report](https://github.com/chalkagents/chalk-protocol/issues/new?template=friction_report.yml)** —
"here's where I got stuck" — is the feedback we want most;
[bug reports and feature requests](https://github.com/chalkagents/chalk-protocol/issues/new/choose)
have templates too. Contributions go through the same gates as our own work: see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Going deeper

- **[QUICKSTART.md](./QUICKSTART.md)** — provider-neutral autonomous setup and the no-model manual path.
- **[docs/harness.md](./docs/harness.md)** — the director's harness: the kit (agents · skills · checks · flows) and why the gates are one part, not the product.
- **[PROTOCOL.md](./PROTOCOL.md)** — the seven primitives (P1–P7) and the full gate model.
- **[RUNNING-AUTONOMOUSLY.md](./RUNNING-AUTONOMOUSLY.md)** — the unattended pipeline, end to end.
- **[docs/CONFIG.md](./docs/CONFIG.md)** — every `protocol.*` key: default, consumer, example.
- **[docs/AGENT_ADAPTER_PROTOCOL.md](./docs/AGENT_ADAPTER_PROTOCOL.md)** — provider-neutral Agent Adapter Protocol v1 and canonical role contracts.
- **[docs/ADAPTER_CONFORMANCE.md](./docs/ADAPTER_CONFORMANCE.md)** — offline conformance command and public fixtures for built-in or external adapters.
- **[docs/CONNECT.md](./docs/CONNECT.md)** — guided offline CLI discovery, profile setup, role assignment, and explicit live smoke testing.
- **[docs/PROVIDER_MATRIX.md](./docs/PROVIDER_MATRIX.md)** — roles, access modes, and output capabilities for every first-party adapter.
- **[docs/MIGRATING_TO_AGENT_PROFILES.md](./docs/MIGRATING_TO_AGENT_PROFILES.md)** — optional migration from every legacy command field and `--executor` setup.
- **[docs/ADAPTER_AUTHOR_GUIDE.md](./docs/ADAPTER_AUTHOR_GUIDE.md)** — Protocol v1 packaging, conformance, identity, usage, diagnostics, and security.
- First-party adapters: **[Claude Code](./docs/integrations/claude-code.md)** · **[OpenCode](./docs/integrations/opencode.md)** · **[Codex CLI](./docs/integrations/codex.md)** · **[Gemini CLI](./docs/integrations/gemini-cli.md)**.
- **[RESEARCH.md](./RESEARCH.md)** — the evidence each gate is built on.
- **`chalk help`** — the full command surface.
