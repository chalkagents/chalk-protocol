# The Chalk harness — the kit assembled around your goal

Chalk is not "a tool that catches cheating agents." It's a **director's harness**: your intent,
taste, and judgment are first-class, and the agent surfaces the decisions that need you instead of
one-shotting past them. Run `chalk harness` to see the kit your project has composed.

The kit has four parts. Assemble the ones your goal needs — nothing here is mandatory except a spine.

## Agents — the doers (BYO)

Model-agnostic executors, planners, reviewers, and retro analysts, wired as shell commands
(`protocol.executor/planner/review/retro.command`). Chalk *directs* them; it doesn't replace them.

## Skills — your project's playbook

Reusable how-to — "how we do X here" — authored as `.chalk/skills/<name>.md` (`chalk skill add`) and
injected into every agent's context. The affirmative counterpart to `lessons` (mistakes not to
repeat). Just text, never executable.

## Checks — the gates, and why they're **one optional part**

The gates (P1–P7 — a locked spec, an adversarial review, a held-out audit, the verify toolchain) were
once framed as the whole product: "catch the cheating agent." That framing is commoditizing, and the
gates are not the point.

**They're the accept button.** You can't direct what you can't verify — the gates are what let a
director delegate to a fleet *without trusting it*. Powerful, but **optional and composable**: a
project can run with none of them, or all of them. They are *one part* of the kit, not the whole
story.

## Flows — how the loop runs

The drivers that walk the read → work → verify → write loop: `run`, `pipeline`, `loop`, `autopilot`.
Fixed and always available — Chalk doesn't ask you to invent a workflow engine.

---

**The core is not the kit — it's you.** The defensible center of a director's harness is your taste
and judgment being first-class: the alignment checkpoint (`chalk align`), the decision digest and the
director inbox (`chalk pending`), mid-flight raising (`chalk raise`), and the judgment that compounds
into every future task. Compose skills, agents, checks, and flows *around* that — the spine remembers
your calls so the agent gets more "you" over time.
