#!/usr/bin/env node
// Chalk Protocol CLI (v0). Drives an agent through read → work → verify → write.
// The protocol's whole value is in the GATES: start (P1), done (P4+P6), amend-spec (P6).
import { resolve, join } from 'node:path';
import { Store, initSpine, installAgentDocs, findRoot, now, id, PHASES, TASK_STATES, NEEDS, UPDATE_TYPES, depsSatisfied, runnableTasks, resolveRef } from '../lib/store.mjs';
import { verify as runVerify } from '../lib/verify.mjs';
import { runReview } from '../lib/review.mjs';
import { runAudit, codeSize, lockFile, listDirFiles, buildGuardPrompt } from '../lib/regression.mjs';
import { projectPlans } from '../lib/plans.mjs';
import { projectBoard } from '../lib/boards.mjs';
import { PRESETS, detectPreset, withRunner, reviewCadences } from '../lib/config.mjs';
import { runDriver } from '../lib/run.mjs';
import { gh as runGh } from '../lib/git.mjs';
import { execSync } from 'node:child_process';

// ---- tiny arg parser: positionals in _, repeated --flag accumulate into arrays ----
function parse(argv) {
  const _ = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2), val = true;
      if (key.includes('=')) { [key, val] = [key.slice(0, key.indexOf('=')), key.slice(key.indexOf('=') + 1)]; }
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
      if (key in flags) flags[key] = [].concat(flags[key], val); else flags[key] = val;
    } else _.push(a);
  }
  return { _, flags };
}
const arr = (v) => (v == null ? [] : [].concat(v));

const C = { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` };
const die = (msg) => { console.error(C.r('✗ ') + msg); process.exit(1); };
const ok = (msg) => console.log(C.g('✓ ') + msg);
// Refresh both Chalk Browser views after a state change. Best-effort — a projection error must
// never break a gate or a CLI command, so failures are swallowed (run `chalk sync` to see them).
const syncBrowser = (s) => { try { projectPlans(s); projectBoard(s); } catch { /* non-fatal */ } };

// ---------------------------------------------------------------- commands
const cmds = {
  init({ flags }) {
    const root = process.cwd();
    // --preset flutter|node|… selects a stack; bare --preset auto-detects from marker files.
    let preset = flags.preset === true ? detectPreset(root) : (flags.preset ? String(flags.preset) : null);
    const auto = flags.preset === true && preset;
    if (preset && !PRESETS[preset]) die(`unknown --preset: ${preset} (choose ${Object.keys(PRESETS).join('|')})`);
    const meta = initSpine(root, { name: flags.name, goal: flags.goal, preset, runner: flags.runner ? String(flags.runner) : undefined });
    ok(`initialized .chalk/ for ${C.b(meta.project.name)} (protocol ${meta.protocol.version})${preset ? C.dim(` · preset ${preset}${auto ? ' (auto-detected)' : ''}`) : ''}`);
    if (flags['no-agents'] !== true) {
      for (const r of installAgentDocs(root)) console.log(C.dim(`  ${r.action} ${r.name} (agent contract)`));
    }
    console.log(C.dim(preset ? '  next: `chalk task add "..."` (verify commands set from the preset)' : '  next: set verify commands in .chalk/chalk.json, then `chalk task add "..."`'));
  },

  // (Re)install the agent contract into AGENTS.md / CLAUDE.md.
  agents() {
    const s = Store.open();
    for (const r of installAgentDocs(s.root)) ok(`${r.action} ${r.name}`);
    console.log(C.dim('  any CLI (Claude Code, Codex, Gemini) will now auto-load the Chalk contract.'));
  },

  // The single command an agent calls to learn its next action (which gate is blocking).
  next() {
    const s = Store.open();
    const tasks = s.tasks();
    const wip = tasks.filter((t) => t.state === 'in-progress');
    const specd = tasks.filter((t) => t.state === 'specd');
    const ready = specd.filter((t) => depsSatisfied(t, tasks));   // deps done → startable now
    const waiting = specd.filter((t) => !depsSatisfied(t, tasks)); // specd but blocked behind deps
    const todo = tasks.filter((t) => t.state === 'todo');
    console.log(C.b('Chalk · next action'));
    const reg0 = s.protocol().regression;
    if (reg0?.required) {
      const la = reg0.lastAudit;
      const stale = !la || !la.green || (la.size && la.size.loc !== codeSize(s.root).loc);
      if (stale) console.log(C.y('  ⚠ held-out audit is stale — run `chalk audit` (required to advance phase).'));
    }
    for (const t of tasks.filter((x) => x.state === 'blocked'))
      console.log(C.y(`  ⊘ blocked: ${t.title} — needs ${t.block?.needs} (${t.block?.reason}). unblock: chalk unblock ${t.id.slice(0, 12)}`));

    if (wip.length) {
      if (wip.length > 1) console.log(C.y(`  ! ${wip.length} tasks in-progress — protocol prefers ONE at a time; finish one first.`));
      for (const t of wip) {
        const short = t.id.slice(0, 12);
        console.log(`  ${C.b('●')} ${C.b(t.title)} ${C.dim(short)} is in-progress.`);
        for (const c of t.acceptanceCriteria || []) console.log(`     → satisfy: ${c.text}`);
        if ((t.tests || []).length) {
          const broken = s.brokenLocks(t);
          console.log(`     ${broken.length ? C.r('✗ tests MODIFIED') : C.dim('READ-ONLY tests')}: ${(t.tests).map((x) => x.path).join(', ')}`);
          if (broken.length) console.log(C.r(`       integrity break — revert them or run: chalk amend-spec ${short} --test <path> --why "..."`));
        }
        const needsReview = reviewRequiredNow(s, t);
        const last = (t.reviews || []).slice(-1)[0];
        const seq = needsReview && !(last && last.verdict === 'pass')
          ? `chalk verify   then   chalk review ${short}   then   chalk done ${short}`
          : `chalk verify   then   chalk done ${short}`;
        console.log(C.dim(`     when ready:  ${seq}`));
        console.log(C.dim(`     read first:  chalk context ${short}`));
      }
      return;
    }
    if (ready.length || waiting.length) {
      if (ready.length) {
        console.log(`  ${C.y('◐')} ${ready.length} task(s) ready. Pick ${C.b('ONE')} and start it:`);
        for (const t of ready) console.log(C.dim(`     chalk start ${t.id.slice(0, 12)}   `) + t.title);
      }
      for (const t of waiting) {
        const deps = (t.after || []).map((ref) => resolveRef(tasks, ref)).filter((d) => d && d.state !== 'done').map((d) => d.title);
        console.log(C.dim(`     ⧗ waiting: ${t.title} — on ${deps.join(', ') || 'unresolved deps'}`));
      }
      if (ready.length) return; // only fall through to todo/done when nothing is startable
      if (!todo.length) { console.log(C.dim('  (all remaining work is waiting on deps or blocked)')); return; }
    }
    if (todo.length) {
      console.log(`  ${C.dim('○')} ${todo.length} task(s) need acceptance criteria before they can start (GATE P1):`);
      for (const t of todo) console.log(C.dim(`     chalk spec ${t.id.slice(0, 12)} --criterion "..."   `) + `(${t.title})`);
      return;
    }
    if (!tasks.length) { console.log(C.dim('  no tasks yet →  chalk task add "<title>"')); return; }
    console.log(`  ${C.g('✓')} all tasks done. Add the next one ${C.dim('(chalk task add)')} or advance phase ${C.dim('(chalk phase ...)')}.`);
  },

  // The ordered backlog/DAG — work grouped by milestone, with dependency edges + runnability.
  backlog() {
    const s = Store.open();
    const tasks = s.tasks();
    if (!tasks.length) { console.log(C.dim('  no tasks yet → chalk task add "<title>" [--milestone M] [--after <id>]')); return; }
    console.log(C.b('Chalk · backlog'));
    const groups = new Map();
    for (const t of tasks) { const k = t.milestone || '(no milestone)'; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
    for (const [milestone, items] of groups) {
      console.log('\n' + C.b(milestone));
      for (const t of items) {
        const deps = (t.after || []).map((ref) => resolveRef(tasks, ref)).filter(Boolean);
        const open = deps.filter((d) => d.state !== 'done').map((d) => d.title);
        let mark;
        if (t.state === 'done') mark = C.g('✓ done');
        else if (t.state === 'blocked') mark = C.y(`⊘ blocked (needs ${t.block?.needs})`);
        else if (t.state === 'in-progress') mark = C.b('● wip');
        else if (open.length) mark = C.dim(`⧗ waiting on ${open.join(', ')}`);
        else if (t.state === 'specd') mark = C.y('▶ runnable');
        else mark = C.dim('○ needs criteria');
        const edge = deps.length ? C.dim(`  → after ${deps.map((d) => d.title).join(', ')}`) : '';
        console.log(`  ${mark}  ${C.dim(t.id.slice(0, 12))} ${t.title}${edge}`);
      }
    }
    const nonDone = tasks.filter((t) => t.state !== 'done');
    if (nonDone.length && !runnableTasks(tasks).length && !tasks.some((t) => t.state === 'in-progress'))
      console.log('\n' + C.y('  ⚠ nothing is runnable — check for a dependency cycle or a blocked upstream task.'));
  },

  // The unattended driver loop (P0 #2). Pulls runnable tasks and drives each through a BYO
  // executor (protocol.executor.command) → verify → review → done, auto-blocking anything the
  // executor can't make green so the run keeps moving. The gates still decide; this just removes
  // the turn boundaries between tasks.
  run({ flags }) {
    const s = Store.open();
    const until = flags.until === 'blocked' ? 'blocked' : 'empty';
    const max = Number(flags.max || 50);
    const r = runDriver(s, { until, max, dryRun: flags['dry-run'] === true, reviewRequiredNow, log: (m) => console.log(C.dim('  ' + m)) });
    if (r.dryRun) {
      console.log(C.b('chalk run · dry-run — planned order'));
      if (!r.planned.length) console.log(C.dim('  (nothing runnable right now)'));
      r.planned.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}${t.milestone ? C.dim(` · ${t.milestone}`) : ''} ${C.dim(t.id.slice(0, 12))}`));
      return;
    }
    if (r.degraded) {
      console.log(C.y('  no executor configured (protocol.executor.command) — falling back to the manual loop:') + '\n');
      cmds.next();
      return;
    }
    syncBrowser(s);
    console.log('\n' + C.b('chalk run · summary'));
    console.log(`  ${C.g(`✓ ${r.completed.length} done`)}  ${r.blocked.length ? C.y(`⊘ ${r.blocked.length} blocked`) + '  ' : ''}${C.dim(`(${r.iterations} iteration(s), stopped: ${r.stopped})`)}`);
    if (r.blocked.length) console.log(C.dim('  run `chalk next` / `chalk status` to see what each blocked task needs.'));
    process.exit(r.stopped === 'blocked' ? 2 : 0);
  },

  // GitHub pipeline — pull open issues into the backlog as tasks (one task per issue, idempotent).
  issue({ _, flags }) {
    const s = Store.open();
    const sub = _[0];
    const ghCfg = s.protocol().github || {};
    if (sub !== 'pull') die('usage: chalk issue pull [--state open] [--label L] [--limit N]');
    const fields = 'number,title,body,labels,url';
    const labelArg = flags.label ? ` --label ${flags.label}` : '';
    let raw;
    try {
      raw = runGh(s.root, ghCfg.command, `issue list --state ${flags.state || 'open'} --json ${fields} --limit ${flags.limit || 50}${labelArg}`);
    } catch (e) {
      die(`gh issue list failed — is \`${ghCfg.command || 'gh'}\` installed and authed for this repo?\n  ${String(e.message).split('\n').slice(-3).join('\n  ')}`);
    }
    const issues = JSON.parse(raw || '[]');
    const existing = new Set(s.tasks().map((t) => t.issue?.number).filter(Boolean));
    let created = 0;
    for (const iss of issues) {
      if (existing.has(iss.number)) continue;
      const labels = (iss.labels || []).map((l) => l.name);
      const branchType = labels.map((n) => ghCfg.labelType?.[n]).find(Boolean) || 'feat';
      const criteria = parseChecklist(iss.body || '').map((text) => ({ text }));
      const t = {
        id: id('task'), title: iss.title, state: criteria.length ? 'specd' : 'todo',
        acceptanceCriteria: criteria, tests: [], heldOut: [], after: [],
        issue: { number: iss.number, url: iss.url, body: iss.body || '' }, branchType,
        pipeline: { stage: 'selected', at: now() }, createdAt: now(), reviews: [],
      };
      s.upsertTask(t); created++;
      s.emitUpdate({ type: 'work-item-started', title: `Imported issue #${iss.number}: ${iss.title}`, taskId: t.id });
      console.log(`  ${C.g('+')} #${iss.number} ${iss.title} ${C.dim(`[${t.state}] → ${branchType}/${iss.number}-…`)}`);
    }
    if (created) syncBrowser(s);
    ok(`pulled ${C.b(String(created))} new issue(s) ${C.dim(`(${issues.length - created} already tracked)`)}`);
  },

  status() {
    const s = Store.open();
    const m = s.meta();
    const tasks = s.tasks();
    const openQ = s.questions().filter((q) => q.status !== 'resolved');
    console.log(`${C.b(m.project.name)}  ${C.dim('· phase')} ${m.protocol?.phase}  ${C.dim('· status')} ${m.protocol?.status}`);
    if (m.project.description) console.log(C.dim(`  goal: ${m.project.description}`));
    console.log('\n' + C.b('Tasks'));
    if (!tasks.length) console.log(C.dim('  (none — `chalk task add "..."`)'));
    for (const st of TASK_STATES) {
      const inState = tasks.filter((t) => t.state === st);
      for (const t of inState) {
        const meta = st === 'blocked' && t.block ? C.y(`  ⊘ needs ${t.block.needs}: ${t.block.reason}`) : C.dim(`(${(t.acceptanceCriteria || []).length} crit, ${(t.tests || []).length} test)`);
        console.log(`  ${stateBadge(st)} ${C.dim(t.id.slice(0, 12))} ${t.title} ${meta}`);
      }
    }
    console.log('\n' + C.b('Open questions') + ` ${openQ.length}`);
    for (const q of openQ.slice(0, 5)) console.log(`  ${C.y('?')} ${q.question} ${C.dim(`→ ${q.awaitingFrom}`)}`);
    const recent = s.updates().slice(-3).reverse();
    if (recent.length) { console.log('\n' + C.b('Recent')); for (const u of recent) console.log(`  ${C.dim(u.at.slice(0, 16))} ${u.title}`); }
  },

  // P3 — context over procedure: surface the spec slice + at-risk tests, not a TDD lecture.
  // Shares buildContext() with the `chalk run` executor so both see identical text.
  context({ _ }) {
    const s = Store.open();
    const t = _[0] ? mustTask(s, _[0]) : null;
    console.log(buildContext(s, t));
  },

  // Bridge to Chalk Browser — project tasks.json into BOTH canonical Browser views:
  //  • .chalk/plans/  — folder-kanban of markdown plans (the spec/planning view)
  //  • .chalk/boards/ — one card board with per-task testArtifact (the execution view)
  // One-way: Protocol owns state via gates, so this rewrites only what it generated and
  // leaves hand-authored plans / user boards untouched. Auto-runs after task add/spec/start/done.
  sync() {
    const s = Store.open();
    const p = projectPlans(s);
    const b = projectBoard(s);
    ok(`projected ${C.b(String(p.written.length))} task(s) → ${C.dim('.chalk/plans/')} + ${C.dim('.chalk/boards/')} ${C.dim(`(${p.removed} stale plan(s) removed)`)}`);
    const byCol = {};
    for (const w of p.written) (byCol[w.column] = byCol[w.column] || []).push(w);
    for (const col of ['todo', 'inprogress', 'testing', 'done']) {
      if (!byCol[col]) continue;
      console.log(`  ${C.b(col)}`);
      for (const w of byCol[col]) console.log(C.dim(`    ${w.filename}`) + '  ' + w.title);
    }
    if (!p.written.length) console.log(C.dim('  (no tasks yet — `chalk task add "..."`)'));
    console.log(C.dim(`  board: ${b.cards} card(s) in chalk-protocol.board.json`));
    console.log(C.dim('  open this project in Chalk Browser — it watches .chalk/plans/ and .chalk/boards/.'));
  },

  task({ _, flags }) {
    const sub = _[0];
    const s = Store.open();
    if (sub === 'add') {
      const title = _.slice(1).join(' ') || flags.title;
      if (!title) die('usage: chalk task add "<title>"');
      const milestone = flags.milestone ? String(flags.milestone) : undefined;
      // Resolve each --after ref to a FULL task id now (reject ambiguous prefixes), so the stored
      // dependency edge can't later bind to the wrong task as more tasks are added.
      const after = arr(flags.after).map(String).map((ref) => {
        const exact = s.tasks().find((t) => t.id === ref);
        const matches = s.tasks().filter((t) => t.id.startsWith(ref));
        if (!exact && !matches.length) die(`--after: no such task: ${ref}`);
        if (!exact && matches.length > 1) die(`--after: ambiguous task ref "${ref}" — use a longer id`);
        return (exact || matches[0]).id;
      });
      const t = { id: id('task'), title, state: 'todo', acceptanceCriteria: [], tests: [], heldOut: [], milestone, after, createdAt: now(), reviews: [] };
      s.upsertTask(t);
      s.emitUpdate({ type: 'work-item-started', title: `Task created: ${title}`, taskId: t.id });
      syncBrowser(s);
      ok(`task ${C.b(t.id.slice(0, 12))} — ${title} ${C.dim(`[todo]${milestone ? ` · ${milestone}` : ''}${after.length ? ` · after ${after.length}` : ''}`)}`);
    } else die('usage: chalk task add "<title>" [--milestone M] [--after <id>]');
  },

  // Attach acceptance criteria and/or LOCK a test file (P1/P2/P6).
  spec({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    let changed = false;
    for (const c of arr(flags.criterion)) { t.acceptanceCriteria.push({ text: String(c) }); changed = true; }
    for (const p of arr(flags.test)) {
      const lock = s.lockTest(resolve(process.cwd(), String(p)));
      if (!t.tests.some((x) => x.path === lock.path)) t.tests.push(lock);
      changed = true;
      console.log(C.dim(`  locked ${lock.path} @ ${lock.sha256.slice(0, 12)}`));
    }
    for (const p of arr(flags['held-out'])) { if (!t.heldOut.includes(String(p))) t.heldOut.push(String(p)); changed = true; }
    if (!changed) die('nothing to add — use --criterion "..." and/or --test <path>');
    if (t.state === 'todo' && (t.acceptanceCriteria.length || t.tests.length)) t.state = 'specd';
    s.upsertTask(t);
    syncBrowser(s);
    ok(`spec updated — ${t.title} ${C.dim(`[${t.state}] ${t.acceptanceCriteria.length} crit, ${t.tests.length} test`)}`);
  },

  // GATE P1 — refuse to start without machine-checkable acceptance criteria.
  start({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const hasCriteria = (t.acceptanceCriteria || []).length || (t.tests || []).length;
    if (!hasCriteria) die(`GATE P1: task has no acceptance criteria. Add them first:\n    chalk spec ${t.id.slice(0, 12)} --criterion "..."  (or --test <path>)`);
    if (t.state === 'done') die('task already done.');
    t.state = 'in-progress'; t.startedAt = now();
    s.upsertTask(t);
    syncBrowser(s);
    s.emitUpdate({ type: 'work-item-started', title: `Started: ${t.title}`, taskId: t.id });
    ok(`started ${C.b(t.title)} ${C.dim('[in-progress]')}`);
    console.log(C.dim(`  read context with: chalk context ${t.id.slice(0, 12)}`));
  },

  // Park a task that needs something only a human can supply, and keep the run moving.
  // The agent contract: `block` it and pull the next task — don't stop while work remains.
  block({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const needs = String(flags.needs || '');
    if (!NEEDS.includes(needs)) die(`--needs must be one of: ${NEEDS.join(', ')}`);
    if (!flags.reason) die('block requires --reason "<what is needed>"');
    if (t.state === 'done') die('cannot block a done task.');
    t.blockedFrom = t.state; // remember where to resume on unblock
    t.state = 'blocked';
    t.block = { needs, reason: String(flags.reason), at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Blocked: ${t.title} (needs ${needs})`, description: String(flags.reason), taskId: t.id });
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

  verify() {
    const s = Store.open();
    const v = runVerify(s);
    console.log(C.b('Verify') + '\n');
    for (const r of v.toolchain) {
      const tag = r.status === 'pass' ? C.g('pass') : r.status === 'fail' ? C.r('fail') : r.status === 'deferred' ? C.y('defer') : C.dim('skip');
      const note = r.status === 'deferred' ? C.dim(`  (${r.cmd})  ${C.y('runs at chalk audit')}`) : (r.cmd ? C.dim(`  (${r.cmd})`) : C.dim('  (not configured)'));
      console.log(`  ${tag}  ${r.gate}${note}`);
      if (r.status === 'fail' && r.tail) console.log(r.tail.split('\n').map((l) => '       ' + C.dim(l)).join('\n'));
    }
    if (v.integrity.length) {
      console.log('\n' + C.r('  test-integrity VIOLATED (P6):'));
      for (const i of v.integrity) for (const b of i.broken) console.log(`    ${C.r('✗')} ${b.path} changed under task ${i.taskId.slice(0, 12)} — use \`chalk amend-spec\``);
    }
    console.log('\n' + (v.green ? C.g('● GREEN — done gate is open') : C.r('● RED — done gate is closed')));
    process.exit(v.green ? 0 : 2);
  },

  // GATE P4 + P6 (+ P5) — done is impossible unless verify is green, locks intact, review passed.
  done({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (t.state !== 'in-progress') die(`task is [${t.state}], not in-progress.`);
    const v = runVerify(s);
    if (!v.green) {
      const reasons = [];
      if (!v.toolchainGreen) reasons.push('toolchain not green (run `chalk verify`)');
      if (!v.integrityGreen) reasons.push('locked tests were modified (P6) — use `chalk amend-spec`');
      die(`GATE P4+P6: cannot mark done — ${reasons.join('; ')}.`);
    }
    // GATE P5 — if review is required for this task (per the configured cadence), the latest
    // review must pass (override is logged).
    if (reviewRequiredNow(s, t)) {
      const last = (t.reviews || []).slice(-1)[0];
      const passed = last && last.verdict === 'pass';
      if (!passed) {
        if (!flags['force-review']) die(`GATE P5: needs a passing adversarial review — run \`chalk review ${t.id.slice(0, 12)}\`${last ? ` (last verdict: ${last.verdict})` : ''}.\n    To override (logged): chalk done ${t.id.slice(0, 12)} --force-review --why "..."`);
        if (!flags.why) die('--force-review requires --why "<reason>" (it is logged as a decision).');
        s.appendDecision({ title: `Overrode review gate for "${t.title}"`, why: String(flags.why) });
        console.log(C.y('  ! review gate overridden (decision logged).'));
      }
    }
    t.state = 'done'; t.doneAt = now();
    s.upsertTask(t);
    syncBrowser(s);
    s.emitUpdate({ type: 'work-item-accepted', title: `Done: ${t.title}`, taskId: t.id });
    ok(`done ${C.b(t.title)} — verify green ✓`);
  },

  // P6 — the ONLY sanctioned path to change a locked acceptance test.
  'amend-spec'({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const why = flags.why || flags.reason;
    if (!flags.test) die('usage: chalk amend-spec <id> --test <path> --why "<reason>"');
    if (!why) die('amend-spec requires --why "<reason>" (the change is logged as a decision).');
    for (const p of arr(flags.test)) {
      const lock = s.lockTest(resolve(process.cwd(), String(p)));
      const i = t.tests.findIndex((x) => x.path === lock.path);
      if (i >= 0) t.tests[i] = lock; else t.tests.push(lock);
      console.log(C.dim(`  re-locked ${lock.path} @ ${lock.sha256.slice(0, 12)}`));
    }
    s.upsertTask(t);
    s.appendDecision({ title: `Amended acceptance test for "${t.title}"`, why: String(why) });
    ok('spec amended + decision logged.');
  },

  // P5 — adversarial review. Runs the configured reviewer; if none, records a manual note.
  review({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const meta = s.meta();
    t.reviews = t.reviews || [];

    if (!meta.protocol?.review?.command) {
      const note = flags.note || _.slice(1).join(' ');
      if (!note) die('no reviewer configured. Set .chalk/chalk.json → protocol.review.command (e.g. "claude -p"),\n  or record a manual review:  chalk review <id> --note "..."');
      t.reviews.push({ at: now(), by: flags.by || 'human', verdict: flags.block ? 'block' : 'pass', findings: [], note: String(note), checklist: ['test-adequacy', 'design-intent', 'regressions'] });
      s.upsertTask(t);
      s.emitUpdate({ type: 'progress-update', title: `Review (manual): ${t.title}`, description: String(note), taskId: t.id });
      return ok('manual review recorded ' + C.dim('(checklist: test-adequacy · design-intent · regressions)'));
    }

    console.log(C.dim('  running adversarial reviewer…'));
    const r = runReview(s, t);
    if (r.status === 'error') die('reviewer did not return a valid JSON verdict. raw tail:\n' + C.dim(r.raw || '(empty)'));
    t.reviews.push({ at: now(), by: 'adversary', verdict: r.verdict, findings: r.findings });
    s.upsertTask(t);
    s.emitUpdate({ type: 'progress-update', title: `Review (${r.verdict}): ${t.title}`, taskId: t.id });
    console.log((r.verdict === 'pass' ? C.g('● review PASS') : C.r('● review BLOCK')) + ` ${C.dim(t.title)}`);
    for (const f of r.findings) console.log(`   ${sev(f.severity)} ${C.dim(`[${f.area}]`)} ${f.note}`);
    if (r.verdict !== 'pass') console.log(C.dim('   fix the blocking findings and re-run `chalk review`.'));
    process.exit(r.verdict === 'pass' ? 0 : 3);
  },

  // P7 — author/lock the held-out regression set (hidden from the implementing agent).
  guard({ _, flags }) {
    const s = Store.open();
    const m = s.meta();
    m.protocol = m.protocol || {};
    const reg = m.protocol.regression = m.protocol.regression || { command: '', authorCommand: '', dir: '.chalk/held-out', required: false, tests: [], lastAudit: null };
    const sub = _[0];
    const lockInto = (abs) => {
      const lock = lockFile(s.root, abs);
      const i = reg.tests.findIndex((t) => t.path === lock.path);
      if (i >= 0) reg.tests[i] = lock; else reg.tests.push(lock);
      return lock;
    };
    if (sub === 'add') {
      const p = _[1] || flags.path;
      if (!p) die('usage: chalk guard add <path>');
      const lock = lockInto(resolve(process.cwd(), String(p)));
      s.saveMeta(m);
      ok(`held-out regression locked: ${lock.path} ${C.dim('(hidden from the implementer)')}`);
    } else if (sub === 'gen') {
      if (!reg.authorCommand) die('set .chalk/chalk.json → protocol.regression.authorCommand (a BYO test-author agent).');
      console.log(C.dim('  running guard author (derives held-out tests from the spec, blind to the code)…'));
      const prompt = buildGuardPrompt(m, s.spec(), s.tasks().flatMap((t) => (t.acceptanceCriteria || []).map((c) => `- [${t.title}] ${c.text}`)).join('\n'));
      try { execSync(withRunner(m.protocol?.runner, reg.authorCommand), { cwd: s.root, input: prompt, stdio: ['pipe', 'inherit', 'inherit'], timeout: 10 * 60 * 1000 }); }
      catch { /* author may write files then exit nonzero */ }
      let n = 0;
      for (const f of listDirFiles(s.root, reg.dir)) { if (/readme/i.test(f)) continue; lockInto(f); n++; }
      s.saveMeta(m);
      ok(`locked ${n} held-out test file(s) under ${reg.dir}`);
    } else if (sub === 'list') {
      if (!reg.tests.length) return console.log(C.dim('  (none — `chalk guard add <path>` or `chalk guard gen`)'));
      for (const t of reg.tests) console.log(`  ${C.dim(t.sha256.slice(0, 12))} ${t.path}`);
    } else die('usage: chalk guard <add <path> | gen | list>');
  },

  // P7 — run the held-out set. Results are WITHHELD (pass/fail only) to prevent overfitting.
  audit() {
    const s = Store.open();
    const r = runAudit(s);
    console.log(C.b('Audit · held-out regression'));
    for (const p of r.broken) console.log(`  ${C.r('✗ integrity')} ${p} ${C.dim('— held-out test modified (P7 violation)')}`);
    if (r.status === 'unconfigured') console.log(C.dim('  no regression.command configured — integrity check only.'));
    else console.log('  ' + (r.passed ? C.g('held-out checks PASS') : C.r('held-out checks FAIL')) + C.dim('  (output withheld — fix against the spec, not the hidden tests)'));
    const phaseRun = (r.phaseGates || []).filter((g) => g.status !== 'skipped' && g.status !== 'deferred');
    if (phaseRun.length) {
      console.log('\n' + C.b('Audit · phase-boundary toolchain gates'));
      for (const g of phaseRun) {
        console.log(`  ${g.status === 'pass' ? C.g('pass') : C.r('fail')}  ${g.gate}${C.dim(`  (${g.cmd})`)}`);
        if (g.status === 'fail' && g.tail) console.log(g.tail.split('\n').map((l) => '       ' + C.dim(l)).join('\n'));
      }
    }
    console.log(C.dim(`  code size: ${r.size.loc} LOC across ${r.size.files} file(s)`));
    const m = s.meta();
    m.protocol = m.protocol || {};
    const reg = m.protocol.regression = m.protocol.regression || {};
    reg.lastAudit = { at: now(), green: r.green, size: r.size, count: (reg.tests || []).length };
    s.saveMeta(m);
    s.emitUpdate({ type: 'progress-update', title: `Audit ${r.green ? 'green' : 'red'} (held-out regression)` });
    console.log('\n' + (r.green ? C.g('● AUDIT GREEN') : C.r('● AUDIT RED — phase gate closed')));
    process.exit(r.green ? 0 : 2);
  },

  phase({ _, flags }) {
    const s = Store.open();
    const p = _[0];
    if (!p) die(`usage: chalk phase <${PHASES.join('|')}>`);
    if (!PHASES.includes(p)) console.log(C.y(`! "${p}" is not a standard phase (${PHASES.join(', ')}) — setting anyway.`));
    // GATE P7 — advancing a phase requires a fresh green held-out audit (size-aware).
    const reg = s.protocol().regression;
    if (reg?.required) {
      const la = reg.lastAudit;
      const size = codeSize(s.root);
      const changed = la && la.size && la.size.loc !== size.loc;
      if (!la || !la.green || changed) {
        if (!flags['force-audit']) {
          const why = !la ? 'never audited' : !la.green ? 'last audit was RED' : 'code changed since last audit';
          die(`GATE P7: run a green \`chalk audit\` before advancing phase (${why}).\n    To override (logged): chalk phase ${p} --force-audit --why "..."`);
        }
        if (!flags.why) die('--force-audit requires --why "<reason>" (it is logged as a decision).');
        s.appendDecision({ title: `Overrode held-out audit gate advancing to phase "${p}"`, why: String(flags.why) });
        console.log(C.y('  ! audit gate overridden (decision logged).'));
      }
    }
    // GATE P5 (phase-advance cadence) — every worked task must carry a passing review.
    if (reviewCadences(s.protocol().review || {}).includes('phase-advance')) {
      const pending = unreviewed(s);
      if (pending.length) {
        if (!flags['force-review']) die(`GATE P5: review cadence is "phase-advance" — these need a passing review first:\n${pending.map((t) => `    chalk review ${t.id.slice(0, 12)}   ${t.title}`).join('\n')}\n    To override (logged): chalk phase ${p} --force-review --why "..."`);
        if (!flags.why) die('--force-review requires --why "<reason>" (it is logged as a decision).');
        s.appendDecision({ title: `Overrode phase-advance review gate advancing to phase "${p}"`, why: String(flags.why) });
        console.log(C.y('  ! phase-advance review gate overridden (decision logged).'));
      }
    }
    s.setPhase(p);
    s.emitUpdate({ type: 'progress-update', title: `Phase → ${p}` });
    ok(`phase → ${C.b(p)}`);
  },

  update({ _, flags }) {
    const s = Store.open();
    const title = _.join(' ') || flags.title;
    if (!title) die('usage: chalk update "<title>" [--type T] [--desc D]');
    const type = flags.type && UPDATE_TYPES.includes(flags.type) ? flags.type : 'progress-update';
    const u = s.emitUpdate({ type, title, description: flags.desc || '' });
    ok(`logged ${C.dim(`[${u.type}]`)} ${title}`);
  },

  decision({ _, flags }) {
    const s = Store.open();
    const title = _.join(' ') || flags.title;
    if (!title) die('usage: chalk decision "<title>" --why "..."');
    s.appendDecision({ title, why: flags.why || '' });
    ok(`decision logged — ${title}`);
  },

  question({ _, flags }) {
    const s = Store.open();
    const sub = _[0];
    const qs = s.questions();
    if (sub === 'add') {
      const text = _.slice(1).join(' ') || flags.q;
      if (!text) die('usage: chalk question add "<q>" [--for us|client]');
      const q = { id: id('q'), question: text, awaitingFrom: flags.for || 'us', status: 'open', at: now() };
      qs.push(q); s.saveQuestions(qs);
      ok(`question ${C.dim(q.id.slice(0, 10))} logged → ${q.awaitingFrom}`);
    } else if (sub === 'resolve') {
      const q = qs.find((x) => x.id === _[1] || x.id.startsWith(_[1] || '\0'));
      if (!q) die('question not found');
      q.status = 'resolved'; q.answer = _.slice(2).join(' ') || flags.answer || '';
      s.saveQuestions(qs);
      s.emitUpdate({ type: 'question-answered', title: `Answered: ${q.question}`, description: q.answer });
      ok('resolved.');
    } else {
      for (const q of qs.filter((x) => x.status !== 'resolved')) console.log(`  ${C.y('?')} ${C.dim(q.id.slice(0, 10))} ${q.question} → ${q.awaitingFrom}`);
    }
  },

  log({ flags }) {
    const s = Store.open();
    const n = Number(flags.n || 15);
    for (const u of s.updates().slice(-n)) console.log(`${C.dim(u.at.slice(0, 16))}  ${C.dim(`[${u.type}]`)} ${u.title}`);
  },

  help() { printHelp(); },
};
cmds.plans = cmds.sync; // alias — `chalk plans` projects both Browser views (plans/ + boards/)

// ---------------------------------------------------------------- helpers
function sev(s) { return { high: C.r('▲ high'), med: C.y('▲ med '), low: C.dim('▲ low ') }[s] || C.dim('▲ ' + (s || '?')); }
function stateBadge(st) {
  return { todo: C.dim('○ todo  '), specd: C.y('◐ specd '), 'in-progress': C.b('● wip   '), blocked: C.y('⊘ blockd'), done: C.g('✓ done  ') }[st] || st;
}
function mustTask(s, ref) {
  if (!ref) die('missing task id');
  const t = s.task(ref);
  if (!t) die(`task not found: ${ref}`);
  return t;
}
// Pull `- [ ] item` / `- [x] item` checklist lines from an issue body → acceptance criteria.
function parseChecklist(body) {
  return (body.match(/^\s*[-*]\s*\[[ xX]\]\s+(.+)$/gm) || []).map((l) => l.replace(/^\s*[-*]\s*\[[ xX]\]\s+/, '').trim()).filter(Boolean);
}
// Is a passing adversarial review (P5) required to mark THIS task done right now?
// Cadence-aware: per-task → always; milestone-boundary → only when this task closes its
// milestone (degrades to no-gate if the task carries no milestone); phase-advance → enforced
// at `chalk phase`, not at per-task done. Back-compat with the legacy review.required boolean.
function reviewRequiredNow(store, task) {
  const cadences = reviewCadences(store.protocol().review || {});
  if (!cadences.length) return false;
  if (cadences.includes('per-task')) return true;
  if (cadences.includes('milestone-boundary') && task.milestone) {
    const remaining = store.tasks().filter((t) => t.milestone === task.milestone && t.id !== task.id && t.state !== 'done');
    if (!remaining.length) return true; // closing the milestone
  }
  return false;
}
// Worked tasks whose latest review isn't a pass (used by the phase-advance cadence gate).
// Only in-progress/done tasks count — todo/specd were never worked, and a `blocked` task is
// parked on a human dependency (creds/upstream) and isn't reviewable, so it must not wedge the gate.
function unreviewed(store) {
  return store.tasks().filter((t) => (t.state === 'in-progress' || t.state === 'done') && (t.reviews || []).slice(-1)[0]?.verdict !== 'pass');
}
function printHelp() {
  console.log(`${C.b('chalk')} — Chalk Protocol CLI (v0)  ${C.dim('· read → work → verify → write')}

${C.b('setup')}
  chalk init [--name N] [--goal G] [--preset flutter|node|dart|python|go] [--runner fvm]
                                       ${C.dim('installs the agent contract; --preset fills verify/regression (bare --preset auto-detects)')}
  chalk agents                         ${C.dim('(re)install the agent contract')}
  chalk status
  chalk next                           ${C.dim('the agent entrypoint: what to do next')}
  chalk context [<id>]                 ${C.dim('agent read blob (P3 test-impact map)')}

${C.b('task lifecycle')}  ${C.dim('(gates refuse to advance unless a fundamental is met)')}
  chalk task add "<title>" [--milestone M] [--after <id>]   ${C.dim('queue work; --after sets a dep edge')}
  chalk backlog                        ${C.dim('ordered DAG by milestone (runnable/waiting/blocked)')}
  chalk issue pull [--state open] [--label L]   ${C.dim('import GitHub issues as tasks (BYO gh)')}
  chalk run [--until empty|blocked] [--max N] [--dry-run]   ${C.dim('unattended: drive runnable tasks via protocol.executor.command')}
  chalk spec <id> --criterion "..." [--test <path>] [--held-out <path>]
  chalk start <id>                     ${C.dim('GATE P1: needs acceptance criteria')}
  chalk verify                         ${C.dim('toolchain + test-integrity (P4/P6/P7)')}
  chalk review <id>                    ${C.dim('GATE P5: adversarial reviewer; cadence via review.requiredAt (per-task|milestone-boundary|phase-advance)')}
  chalk done <id> [--force-review --why "..."]   ${C.dim('GATE P4+P6(+P5): verify green, locks intact, review passed')}
  chalk amend-spec <id> --test <path> --why "..."   ${C.dim('gated test change (P6)')}
  chalk block <id> --needs <creds|decision|human-input|upstream> --reason "..."   ${C.dim('park; keep the run moving')}
  chalk unblock <id>                   ${C.dim('restore a blocked task to its prior state')}

${C.b('held-out regression (P7)')}  ${C.dim('hidden from the implementing agent')}
  chalk guard add <path> | gen | list  ${C.dim('author/lock the held-out set (from the spec)')}
  chalk audit                          ${C.dim('run held-out set; results withheld; gates phase advance')}

${C.b('spine')}
  chalk phase <${PHASES.join('|')}> [--force-audit --why "..."]
  chalk update "<title>" [--type T] [--desc D]
  chalk decision "<title>" --why "..."
  chalk question add "<q>" [--for us|client] | resolve <id> "<answer>" | (list)
  chalk log [--n N]

${C.b('chalk browser bridge')}
  chalk sync                           ${C.dim('project tasks.json → .chalk/plans/ + .chalk/boards/ (auto-runs on task/start/done)')}
  chalk plans                          ${C.dim('alias for sync')}`);
}

// ---------------------------------------------------------------- dispatch
const [, , cmd, ...rest] = process.argv;
const parsed = parse(rest);
try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { printHelp(); process.exit(0); }
  const fn = cmds[cmd];
  if (!fn) die(`unknown command: ${cmd}  (try \`chalk help\`)`);
  fn(parsed);
} catch (e) {
  die(e.message);
}
