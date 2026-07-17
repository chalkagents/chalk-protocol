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

So we built the moves for it.

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

**5/  ② Mid-work, the agent raises the fork — it doesn't guess**
```
agent: $ chalk raise "encrypt refunds at rest?" --options "yes|no"
$ chalk work
✗ 1 fork raised for the director. Not proceeding on a guess.
$ chalk pending answer raise-d475 "yes — tenant KMS key"
✓ answered — guides the next chalk work
```
The build *pauses* on the judgment call. Working out loud, literally.

**6/  ③ The reviewer hands you a decision digest**
Not just pass/block — the judgment calls it made, each with blast-radius × reversibility:
```
◇ Decision digest
  ■ high  refund key = charge_id only (not +amount) — "simplest"
  ■ med   partial refund defaults to full balance — "convenient"
  ■ low   named the file refund.js
```

**7/  ④ The director inbox — steer the empty middle**
```
$ chalk pending
  ■ high  refund key = charge_id only …
$ chalk pending redirect …#0 "key on charge_id+amount — a re-charge must not dedupe"
```
The risky, hard-to-undo calls rise to the top. You redirect them instead of discovering them in prod.

**8/  ⑤ The redirect actually re-directs**
```
$ chalk pending redirect …#0 "key on charge_id+amount"
✓ redirected — task re-opened for rework
```
The correction lands in the agent's context ("REBUILD to these"), it rebuilds to your call, and completing the task resolves it. Not a logged note you chase later — a loop that closes.

**9/  ⑥ And your judgment compounds**
The next task's context already carries it:
```
## Director's calls so far (apply this taste)
- answered: "encrypt refunds at rest?" → yes — tenant KMS key
- redirected: "refund key = charge_id only" → key on charge_id+amount
```
The fork you decided once never comes back to be guessed again.

**10/**
align → raise → digest → pending → rebuild → compound.

The gates didn't go away. They became the accept button — one part of the kit (`chalk harness`: agents · skills · checks · flows). The agent still moves fast — it just stops deciding things that were yours to decide, and it remembers what you decided.

**11/**
You can't direct what you can't verify.

It's open source, runs offline in ~2 min:
`bash docs/demo/director-harness-demo.sh`

(built with Chalk, reviewed by Chalk — the reviewer blocked our own PR for a missing test. good.)

---

## Cut B — LinkedIn

**We were building an AI-agent harness to catch cheating agents. Then the maker admitted he didn't feel the value. So we rebuilt it.**

The honest trigger: we ran our own tool autonomously on a real task. The agent looped, built everything — and was subtly misaligned by the end. It hadn't cheated a test. It had made a dozen small judgment calls — an idempotency key here, a default there — and shipped them as if they were settled.

Every AI coding tool gates the **plan** and the **PR**. Nobody owns the **middle** — the choices an agent resolves silently while it works. That's where "technically passed the tests, wrong product" comes from.

So we reframed the whole thing from a *referee that catches cheats* into a **director's harness** — where your judgment is first-class and the agent surfaces the calls that need it. Four moves:

1. **Align before build.** The agent can't start writing code until a human accepts the acceptance criteria as the definition of *done*.
2. **Raise, don't guess.** Mid-work, when the agent hits a fork the criteria don't answer, it *raises* it — and the build pauses on the open question instead of shipping a guess. The agent works out loud.
3. **A decision digest.** The reviewer no longer just says pass/block — it hands you the judgment calls the agent made, each scored by blast-radius and reversibility, to accept or redirect.
4. **A director inbox.** `chalk pending` ranks raised forks and risky calls across every task — the load-bearing, hard-to-undo ones at the top — so you steer the middle instead of discovering it later.

And it closes the loop. When you redirect a call, the correction travels back into the work — the task re-opens, the agent rebuilds to your instruction, and the directive resolves on completion. Then it **compounds**: your decision, with its reasoning, folds into the next task's context, so the same fork never comes back to be guessed again. Judgment stops being disposable and starts accruing.

The gates didn't disappear. They became the accept button — one optional part of a composable kit (`chalk harness` shows what you've assembled: agents, skills, checks, flows; `chalk skill add` teaches the project your playbook). The agent still moves fast; it just stops deciding things that were yours to decide — and it remembers what you decided.

**You can't direct what you can't verify.**

Open source, runs offline in about two minutes. Built with the tool itself — and the tool's own adversarial reviewer blocked our PRs for real bugs and missing tests along the way. Which is exactly the point.

---

### Recording notes
- Run `bash docs/demo/director-harness-demo.sh` in a chalk-protocol checkout; it pauses on Enter between the eight beats — good for a screen recording.
- Terminal: dark theme, ~100 cols, large font. The eight `▐` banners are your scene cuts.
- Money shots: beat 2 (the align refusal), beat 3 (the agent *raising* mid-work and the build pausing), beat 5 (the ranked inbox + redirect), and beat 7 (a *new* task already carrying your past calls — the moat). Hold on those.
- The arc to narrate: **align → raise → digest → pending → rebuild → compound**, closing on beat 8 (`chalk harness` — the kit you composed).
