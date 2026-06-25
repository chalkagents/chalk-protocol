# Chalk Protocol — Handover: improvements from the first real-project dogfood

**Author:** Cairn build session (Claude Code)
**Date:** 2026-06-25
**Subject:** What `chalk` needs to graduate from a *gate system* to an *unattended harness*, learned by building a real app through it.

---

## For the reader (context in 60 seconds)

**Chalk Protocol** is a layer-2 agent harness: a durable `.chalk/` project-state spine + a CLI
that drives any coding agent through a **read → work → verify → write** loop, holding it to
software-development fundamentals via *enforceable gates* (acceptance criteria before start;
external verify before done; locked-test integrity; held-out regression). It does **not** write
code — the agent is a pluggable executor; Chalk owns state + gates.

**Cairn** is the dogfood: a Flutter habit-streak app (reading-first, on-device Gemma, offline
sync) built entirely through `chalk`. In one session it produced **two milestones, 6 gated tasks,
34 passing tests, zero unfair gate failures** — and one *correct* catch (verify blocked `done`
because a plugin's API had moved to named params; the impl "looked right" but didn't compile).
That catch is the P4 thesis — *LLMs can't self-certify* — demonstrated live.

This document is the feedback from that run.

---

## The one finding that matters

**Chalk is a referee, not a clock.** It enforces fundamentals beautifully but has **no model of
autonomous continuation**. `chalk next` returns one action; the contract says "one task at a
time"; then nothing tells the driver to pull the next task and keep going, and nothing
distinguishes *"stop — a human is genuinely needed"* from *"stop — arbitrary turn boundary."*

Consequence observed in the Cairn run: **every stop was a conversational choice, not a gate.**
When the build hit a step needing the user's Firebase credentials, there was no protocol-level way
to *park that task and continue on other work* — so the whole run halted and waited for a human.

The three P0 proposals below close that gap. Everything else is smaller friction.

---

## P0 — make the harness *run*, not just gate

### 1. First-class `blocked` task state + reason  ← **start here**
**Friction:** Hitting an external dependency (Firebase creds) had no representation. I used
`chalk question` (a side channel) and stopped the conversation. There was no way to mark the task
blocked and **auto-advance to the next runnable task.**

**Proposal:**
```
chalk block   <id> --reason "needs Firebase project (flutterfire configure)" --needs creds
chalk unblock <id>
```
- New task state `blocked`; `--needs ∈ {creds, decision, human-input, upstream}`.
- `chalk next` **skips** blocked tasks and returns the next runnable one.
- `chalk status` lists blockers *with their `--needs`*, so the human sees exactly what unblocks
  the run.
- The agent contract changes from *"stop and ask"* to *"`block` it and keep going; only a fully
  blocked queue ends the run."*

A concrete, code-level implementation spec is in **Appendix A** (small surface — ~1 file + 1
test). This is the highest payoff for the least change.

### 2. A driver loop: `chalk run`
**Friction:** The read→work→verify→write loop is documented prose; the agent must re-enter it each
task by memory. No "continue" affordance.
**Proposal:**
```
chalk run [--until empty|blocked] [--max N] [--dry-run]
```
Repeatedly: `next` → (agent works the task) → `verify` → `done`, looping until the queue is empty
or a `blocked`/RED state it can't clear. It doesn't code — it removes the turn boundaries between
tasks. `--dry-run` prints the planned task order.

### 3. A backlog / DAG, not reactive one-at-a-time tasks
**Friction:** Tasks were created one at a time, *after* each `done`. The driver never knew the
whole queue, so every task boundary was a natural place to stop.
**Proposal:**
```
chalk plan add "<title>" [--milestone core] [--after <id>]   # queue work without starting
chalk plan list                                              # the ordered backlog
```
Tasks gain a `milestone` tag and `after` dependency edges. `chalk next` picks the next task whose
deps are `done` and which isn't `blocked`. Now the driver has runway and only *human-needed* edges
cause a stop.

---

## P1 — config & vocabulary friction

### 4. Separate `milestone` (feature) from `phase` (lifecycle)
Chalk's `phase` enum is the dev lifecycle (`discovery→…→ship`). My feature milestones
(`core, reminders, sync, multi-habit, gemma, genui`) don't map onto it, so I tracked them in task
titles (`core: …`). Add an orthogonal, free-form `milestone` grouping; let `chalk audit` gate
milestone boundaries, not only the six fixed phases.

### 5. Stack presets + a runner prefix
I hand-edited every verify command and prefixed all of them with `fvm flutter` (fvm-managed SDK).
**Proposal:** `chalk init --preset flutter` fills `verify={test:"flutter test", lint:"flutter
analyze"}`, plus a single `protocol.runner` prefix (e.g. `"fvm"`) applied to every gate command so
config stays DRY. Presets for `flutter | node | dart | python | go`; could auto-detect from
`pubspec.yaml` / `package.json`.

### 6. Per-gate scheduling: `when: task | phase`
I wanted `flutter build` in the gate set, but it's too slow per task — so I dropped it. The config
is all-or-nothing per gate.
**Proposal:**
```json
"build": { "cmd": "flutter build apk --debug", "when": "phase" }
```
`task` gates run on every `chalk verify`; `phase` gates run only in `chalk audit` / phase advance.
Cheap checks every task, expensive ones at boundaries.

### 7. Configurable review / audit cadence
P5 review is a per-task `required` boolean. For autonomy I wanted "review only at milestone
boundaries," emulated by leaving it `false`.
**Proposal:** `review.requiredAt: ["milestone-boundary" | "per-task" | "phase-advance"]`. Fast
mid-milestone, rigorous at the seams.

---

## P2 — smaller observations

8. **`verify` ignores the P3 test-impact map it advertises.** P3 says `chalk context` surfaces
   *which tests are at risk*, but `verify` always runs the whole suite. Cheap now (34 tests, ~2s);
   at scale an `--impacted` verify (full suite only at `audit`) would honor P3's own premise.
9. **Held-out (P7) ergonomics for non-Node stacks.** I set `regression.command = "flutter test
   .chalk/held-out"`, which works, but Flutter expects tests under `test/`. The Node default
   (`node --test`) quietly assumes the host stack — a documented `--test-dir` pattern would help.
10. **`chalk done --continue`** that immediately starts the next runnable task — one fewer
    round-trip, and a building block for #2.
11. **`chalk log --gate-catches`** — surface the moments a gate *caught* something (like the v22
    API catch) as proof-of-value telemetry, and great material for RESEARCH.md.

---

## Suggested order of work
1. **#1 `blocked` state** — biggest fix for "stops a lot," smallest surface (Appendix A).
2. **#3 backlog/DAG + #4 milestones** — give the driver runway.
3. **#2 `chalk run`** — ties them into an unattended harness.
4. **#5–#7 config DRYness** — remove the per-project setup tax.
5. **#8–#11** — polish + telemetry.

Net: today Chalk is the referee. These make it also the clock — it keeps the game moving and only
blows the whistle (to a human) when something genuinely off-field needs them.

---

## Appendix A — implementation spec for #1 (`blocked` state)

Grounded in the current code (`lib/store.mjs`, `bin/chalk.mjs`, `test/protocol.test.mjs`). Tasks
already carry a `state` field over `TASK_STATES`. Keep the change minimal and gate-consistent.

**`lib/store.mjs`**
- Extend the state list so `status` groups blocked tasks:
  `export const TASK_STATES = ['todo', 'specd', 'in-progress', 'blocked', 'done'];`
- (No new file I/O — block metadata rides on the task object.)
- Add a `NEEDS = ['creds','decision','human-input','upstream']` export for validation.
- In `AGENT_GUIDE`, change the "stuck" instruction from *stop and ask* to:
  *"If a task needs something only a human can provide (creds, a decision, an upstream task),
  run `chalk block <id> --needs … --reason …` and move to the next task with `chalk next`.
  Do not stop the run while other tasks are runnable."*

**`bin/chalk.mjs`**
- New commands:
  ```js
  block({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const needs = String(flags.needs || '');
    if (!NEEDS.includes(needs)) die(`--needs must be one of: ${NEEDS.join(', ')}`);
    if (!flags.reason) die('block requires --reason "<what is needed>"');
    t.blockedFrom = t.state;                 // remember where to resume
    t.state = 'blocked';
    t.block = { needs, reason: String(flags.reason), at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Blocked: ${t.title} (needs ${needs})`, taskId: t.id });
    ok(`blocked ${C.b(t.title)} ${C.dim(`— needs ${needs}`)}`);
  },
  unblock({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (t.state !== 'blocked') die(`task is [${t.state}], not blocked.`);
    t.state = t.blockedFrom || 'specd';
    delete t.block; delete t.blockedFrom;
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Unblocked: ${t.title}`, taskId: t.id });
    ok(`unblocked ${C.b(t.title)} ${C.dim(`[${t.state}]`)}`);
  },
  ```
- `next`: blocked tasks already fall out of the `wip/specd/todo` filters (their state is
  `blocked`), so they're skipped automatically. Add a surfacing block near the top (next to the
  audit-stale warning):
  ```js
  const blocked = tasks.filter((t) => t.state === 'blocked');
  if (blocked.length) for (const t of blocked)
    console.log(C.y(`  ⊘ blocked: ${t.title} — needs ${t.block?.needs} (${t.block?.reason}). unblock: chalk unblock ${t.id.slice(0,12)}`));
  ```
- `status`: `TASK_STATES` now includes `blocked`, so the existing grouping loop renders it. Add a
  badge in `stateBadge`: `blocked: C.y('⊘ blockd')`, and append the need to the line when present.
- `printHelp`: add `chalk block <id> --needs <creds|decision|human-input|upstream> --reason "..."`
  and `chalk unblock <id>` under the task-lifecycle section.

**`test/protocol.test.mjs`** (the locked acceptance test — follows the existing `chalk(cwd,…)` /
`tid` / `conf` helpers):
```js
test('blocked — next skips a blocked task; status shows the need; unblock restores it', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'needs creds'); const a = tid(d, 0);
  chalk(d, 'task', 'add', 'runnable');    const b = tid(d, 1);
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'spec', b, '--criterion', 'y');
  chalk(d, 'start', a);
  assert.equal(chalk(d, 'block', a, '--needs', 'bogus', '--reason', 'r').code, 1, 'rejects unknown --needs');
  assert.equal(chalk(d, 'block', a, '--needs', 'creds', '--reason', 'firebase').code, 0);
  const n = chalk(d, 'next').out;
  assert.ok(n.includes('runnable') || n.includes(b), 'next points to the runnable task');
  assert.ok(/blocked/i.test(chalk(d, 'status').out), 'status surfaces the blocked task');
  assert.equal(chalk(d, 'unblock', a).code, 0);
  assert.ok(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'),'utf8'))
              .find(t => t.id.startsWith(a)).state === 'in-progress', 'unblock restores prior state');
});
```

**Dogfood path to ship it:** this repo runs under Chalk itself —
`chalk task add "blocked state + reason (P0 #1)"` → write the test above →
`chalk spec <id> --criterion "..." --test test/protocol.test.mjs` → `chalk start` → implement →
`chalk verify` (its gate suite is `node --test`) → `chalk done`.
