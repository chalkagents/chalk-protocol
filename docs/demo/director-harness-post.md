# The Director's Harness — launch post (two cuts)

Origin: issue #160 — an autonomous run that built everything and *only then* turned out misaligned.
Spine: **you can't direct what you can't verify.** Demo: `docs/demo/director-harness-demo.sh`.

---

## Cut A — X / Twitter thread

**1/**
Your coding agent doesn't lie to you. It does something quieter and worse:

it makes a dozen judgment calls you never see, and ships them as if they were facts.

We rebuilt Chalk around that problem. Here's the director's harness. 🧵

**2/**
The trigger was honest. We ran Chalk autonomously on a real task. It looped, built the whole thing — and was subtly *wrong* by the end.

Not because it cheated a test. Because nobody agreed on what "done" meant before it started.

**3/**
Every AI coding tool gates two moments: the plan, and the PR.

Nobody owns the middle — the choices an agent resolves silently *while* building. That's where misalignment is born.

So we built three moves for it.

**4/  ① Accept what "done" means — before the build**
```
$ chalk work
✗ criteria not accepted — run `chalk align` first
$ chalk align
  1. refunds are idempotent per charge id
  2. partial refunds are supported
✓ aligned
```
The agent can't one-shot past your intent.

**5/  ② The reviewer hands you a decision digest**
Not just pass/block — the judgment calls it made, each with blast-radius × reversibility:
```
◇ Decision digest
  ■ high  refund key = charge_id only (not +amount) — "simplest"
  ■ med   partial refund defaults to full balance — "convenient"
  ■ low   named the file refund.js
```

**6/  ③ The director inbox — steer the empty middle**
```
$ chalk pending
  ■ high  refund key = charge_id only …
$ chalk pending redirect …#0 "key on charge_id+amount — a re-charge must not dedupe"
```
The risky, hard-to-undo calls rise to the top. You redirect them instead of discovering them in prod.

**7/**
align → digest → pending.

The gates didn't go away. They became the accept button. The agent still moves fast — it just stops deciding things that were yours to decide.

**8/**
You can't direct what you can't verify.

It's open source, runs offline in 90s:
`bash docs/demo/director-harness-demo.sh`

(built with Chalk, reviewed by Chalk — the reviewer blocked our own PR for a missing test. good.)

---

## Cut B — LinkedIn

**We were building an AI-agent harness to catch cheating agents. Then the maker admitted he didn't feel the value. So we rebuilt it.**

The honest trigger: we ran our own tool autonomously on a real task. The agent looped, built everything — and was subtly misaligned by the end. It hadn't cheated a test. It had made a dozen small judgment calls — an idempotency key here, a default there — and shipped them as if they were settled.

Every AI coding tool gates the **plan** and the **PR**. Nobody owns the **middle** — the choices an agent resolves silently while it works. That's where "technically passed the tests, wrong product" comes from.

So we reframed the whole thing from a *referee that catches cheats* into a **director's harness** — where your judgment is first-class and the agent surfaces the calls that need it. Three moves:

1. **Align before build.** The agent can't start writing code until a human accepts the acceptance criteria as the definition of *done*.
2. **A decision digest.** The reviewer no longer just says pass/block — it hands you the judgment calls the agent made, each scored by blast-radius and reversibility, to accept or redirect.
3. **A director inbox.** `chalk pending` ranks those calls by risk across every task — the load-bearing, hard-to-undo ones at the top — so you steer the middle instead of discovering it later.

The gates didn't disappear. They became the accept button. The agent still moves fast; it just stops deciding things that were yours to decide.

**You can't direct what you can't verify.**

Open source, runs offline in about 90 seconds. Built with the tool itself — and the tool's own adversarial reviewer blocked our PR for shipping a behavior with no test. Which is exactly the point.

---

### Recording notes
- Run `bash docs/demo/director-harness-demo.sh` in a chalk-protocol checkout; it pauses on Enter between the four beats — good for a screen recording.
- Terminal: dark theme, ~100 cols, large font. The four `▐` banners are your scene cuts.
- Beat 2 (the refusal) and beat 4 (the ranked inbox + redirect) are the money shots — hold on those.
