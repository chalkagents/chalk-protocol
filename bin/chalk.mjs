#!/usr/bin/env node
// Chalk Protocol CLI (v0). Drives an agent through read → work → verify → write.
// The protocol's whole value is in the GATES: start (P1), done (P4+P6), amend-spec (P6).
import { resolve, join } from 'node:path';
import { Store, initSpine, installAgentDocs, findRoot, now, id, PROTOCOL, PHASES, TASK_STATES, NEEDS, UPDATE_TYPES, depsSatisfied, runnableTasks, resolveRef, workdir, buildContext } from '../lib/store.mjs';
import { verify as runVerify } from '../lib/verify.mjs';
import { runReview } from '../lib/review.mjs';
import { runAudit, codeSize, lockFile, listDirFiles, buildGuardPrompt } from '../lib/regression.mjs';
import { projectPlans } from '../lib/plans.mjs';
import { projectBoard } from '../lib/boards.mjs';
import { PRESETS, detectPreset, withRunner, reviewCadences } from '../lib/config.mjs';
import { runDriver } from '../lib/run.mjs';
import { gh as runGh, git as runGit, gitAdd, gitCommit, changedPaths, worktreeAdd, worktreeRemove, currentRepo } from '../lib/git.mjs';
import { runSpecs } from '../lib/e2e.mjs';
import { extractScreenshots, evidenceMarkdown } from '../lib/evidence.mjs';
import { runPipeline } from '../lib/pipeline.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { runSmoke } from '../lib/smoke.mjs';
import { runAutopilot } from '../lib/autopilot.mjs';
import { runLoop } from '../lib/loop.mjs';
import { missingRequiredTest } from '../lib/testgate.mjs';
import { runRetro, titlesSimilar } from '../lib/retro.mjs';
import { basename } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// Monotonic pipeline-stage rank — makes each side-effecting stage idempotent so an interrupted
// sweep resumes cleanly. A stage re-run when the task is already at/past its target no-ops with
// exit 0 instead of repeating the side effect (duplicate commit / duplicate PR) or dying
// ("nothing to commit", which would block the task). Order mirrors the lib/pipeline.mjs progression.
const PIPE_STAGES = ['selected', 'branched', 'planned', 'verified', 'committed', 'pr-open', 'reviewed', 'tested', 'cleaned'];
const stageRank = (st) => PIPE_STAGES.indexOf(st);
const stageDone = (t, target) => stageRank(t.pipeline?.stage) >= stageRank(target);


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

  // Print the protocol version on its own line.
  version() {
    console.log(PROTOCOL);
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
        issue: { number: iss.number, url: iss.url, body: iss.body || '' }, branchType, labels,
        pipeline: { stage: 'selected', at: now() }, createdAt: now(), reviews: [],
      };
      s.upsertTask(t); created++;
      s.emitUpdate({ type: 'work-item-started', title: `Imported issue #${iss.number}: ${iss.title}`, taskId: t.id });
      console.log(`  ${C.g('+')} #${iss.number} ${iss.title} ${C.dim(`[${t.state}] → ${branchType}/${iss.number}-…`)}`);
    }
    if (created) syncBrowser(s);
    ok(`pulled ${C.b(String(created))} new issue(s) ${C.dim(`(${issues.length - created} already tracked)`)}`);
  },

  // GitHub pipeline — create the feature branch + an isolated git worktree for a task.
  branch({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const wt = s.protocol().worktree || {};
    const gh0 = s.protocol().github || {};
    // Idempotency guard keyed on the WORKTREE actually still existing. A leftover `branch` field whose
    // worktree is gone (a cleanup, or an out-of-band `rm -rf`) is stale and must be recreated — keying
    // on the branch alone would no-op while leaving t.worktree pointing at a missing dir (Finding 3).
    const liveWorktree = wt.enabled === false ? true : !!(t.worktree && t.worktree !== s.root && existsSync(t.worktree));
    if (stageDone(t, 'branched') && liveWorktree) {
      return ok(`branch ${C.b(t.branch || '')} ${C.dim('(already done)')}`);
    }
    const type = t.branchType || 'feat';
    const slug = pipelineSlug(t.title);
    t.branch = t.branch || `${type}/${t.issue?.number ? `${t.issue.number}-` : ''}${slug}`;
    if (wt.enabled !== false) {
      const repo = (currentRepo(s.root) || basename(s.root)).split('/').pop();
      const dir = resolve(s.root, wt.dir || '..', `${repo}-${t.branch.replace(/\//g, '-')}`);
      try { worktreeAdd(s.root, { dir, branch: t.branch, base: gh0.base || 'main' }); }
      catch (e) { die(`worktree add failed: ${String(e.message).split('\n').slice(-2).join(' ')}`); }
      // No spine is copied into the worktree: it is a pure code sandbox. Any `chalk` command run from
      // here (the executor's, or a manual one) resolves to the MAIN checkout's single canonical spine
      // via findRoot's linked-worktree detection — so state can never bifurcate. (Finding #4)
      t.worktree = dir;
      // Bootstrap hook: a fresh worktree has no resolved toolchain (no .dart_tool/, node_modules, venv);
      // run the configured setup once before work/verify. A failure blocks here with a clear, diagnosable
      // reason rather than a confusing verify failure later. (Finding 2)
      if (wt.setup) {
        console.log(C.dim(`  worktree setup: ${wt.setup}`));
        try { execSync(withRunner(s.protocol().runner, wt.setup), { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], timeout: 15 * 60 * 1000 }); }
        catch (e) { die(`worktree setup failed (\`${wt.setup}\`): ${String(e.message).split('\n').slice(-2).join(' ')}`); }
      }
    } else {
      t.worktree = s.root; // no isolation — work in the primary tree
    }
    t.pipeline = { ...(t.pipeline || {}), stage: 'branched', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Branched: ${t.branch}`, taskId: t.id });
    ok(`branch ${C.b(t.branch)} ${C.dim(`· worktree ${t.worktree}`)}`);
  },

  // GitHub pipeline — conventional commit of the executor's changes in the task's worktree.
  // Stages specific code paths only (never `git add -A`, never the spine state).
  commit({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'committed')) return ok(`commit ${C.dim('(already done)')}`);
    const wd = workdir(s, t);
    const paths = changedPaths(wd).filter((p) => !p.startsWith('.chalk/') || p.startsWith('.chalk/evidence/'));
    if (!paths.length) die('nothing to commit — the executor made no file changes in the worktree.');
    const type = t.branchType || 'feat';
    // Strip a conventional prefix the issue title may already carry, so we don't double up
    // (e.g. issue "feat: add X" must not become "feat: feat: add X").
    const desc = (t.title || 'update').replace(/^\s*(feat|fix|chore|docs|refactor|test|perf|style|build|ci)(\([^)]*\))?:\s*/i, '').replace(/^./, (c) => c.toLowerCase()).slice(0, 60);
    const subject = `${type}: ${desc}`;
    gitAdd(wd, paths);
    gitCommit(wd, [subject, t.issue?.number ? `Closes #${t.issue.number}` : '']);
    t.pipeline = { ...(t.pipeline || {}), stage: 'committed', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'work-item-submitted', title: `Committed: ${subject}`, taskId: t.id });
    ok(`committed ${C.dim(`${paths.length} file(s)`)} — ${C.b(subject)}`);
  },

  // GitHub pipeline — push the branch and open a PR (conventional title + Summary/Changes/Test-plan).
  pr({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'pr-open')) return ok(`PR ${C.b('#' + (t.pr?.number || '?'))} ${C.dim('(already open)')}`);
    const gh0 = s.protocol().github || {};
    const wd = workdir(s, t);
    if (!t.branch) die('no branch — run `chalk branch <id>` first.');
    try { runGit(wd, `push -u origin ${t.branch}`); } catch (e) { die(`git push failed: ${String(e.message).split('\n').slice(-2).join(' ')}`); }
    const type = t.branchType || 'feat';
    const title = `${type}: ${(t.title || '').replace(/^\s*(feat|fix|chore|docs|refactor|test|perf|style|build|ci)(\([^)]*\))?:\s*/i, '').replace(/^./, (c) => c.toLowerCase())}`;
    const body = [
      '## Summary', `- ${t.title}${t.issue?.number ? ` (closes #${t.issue.number})` : ''}`, '',
      '## Changes', ...(t.acceptanceCriteria || []).map((c) => `- ${c.text}`), '',
      '## Test plan', '- `chalk verify` green (toolchain + integrity + e2e)',
      t.issue?.number ? `\nCloses #${t.issue.number}` : '',
    ].join('\n');
    // Quote each label — GitHub label names are attacker-controlled (from the issue) and may
    // contain shell metacharacters; an unquoted value would be command injection in an unattended run.
    const labels = (t.labels || []).map((l) => `--label ${shq(l)}`).join(' ');
    let out;
    try { out = runGh(wd, gh0.command, `pr create --base ${gh0.base || 'main'} --head ${t.branch} --title ${shq(title)} --body ${shq(body)} ${labels}`); }
    catch (e) { die(`gh pr create failed: ${String(e.message).split('\n').slice(-3).join('\n  ')}`); }
    const url = (out.match(/https?:\/\/\S+\/pull\/\d+/) || [out.trim()])[0];
    const number = Number((url.match(/\/pull\/(\d+)/) || [])[1]) || undefined;
    t.pr = { number, url };
    t.pipeline = { ...(t.pipeline || {}), stage: 'pr-open', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'work-item-submitted', title: `PR #${number || '?'} opened`, taskId: t.id });
    ok(`PR ${C.b('#' + (number || '?'))} ${C.dim(url)}`);
  },

  // Planning stage — a read-only planner agent surveys the code, picks the best approach, and emits
  // a plan stored on the task (injected into the executor's context). Advisory; the gates still decide.
  plan({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'planned')) return ok(`plan ${C.dim('(already done)')}`);
    const cmd = s.protocol().planner?.command;
    if (!cmd) die('no planner configured (protocol.planner.command).');
    let out = '';
    const t0 = Date.now();
    try { out = execSync(withRunner(s.protocol().runner, cmd), { cwd: workdir(s, t), input: buildContext(s, t), encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], timeout: 10 * 60 * 1000 }); }
    catch (e) { out = `${e.stdout || ''}`; }
    s.logCost({ taskId: t.id, stage: 'plan', agent: 'planner', ms: Date.now() - t0 });
    const planText = out.trim();
    if (!planText) die('planner produced no plan.');
    t.plan = planText.slice(0, 8000);
    t.pipeline = { ...(t.pipeline || {}), stage: 'planned', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'planning-generated', title: `Planned: ${t.title}`, taskId: t.id });
    ok(`plan ready ${C.dim(`(${planText.split('\n').length} lines)`)} ${C.dim('→ the executor will implement it')}`);
  },

  // GitHub pipeline — start (if needed) + run the executor in the worktree + verify. exit 2 RED.
  work({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'verified')) return ok(`work ${C.b(t.title)} ${C.dim('(already verified)')}`);
    if (t.state === 'todo' || t.state === 'specd') {
      if (!((t.acceptanceCriteria || []).length || (t.tests || []).length)) die('GATE P1: task has no acceptance criteria.');
      t.state = 'in-progress'; t.startedAt = now(); s.upsertTask(t);
    }
    if (t.state !== 'in-progress') die(`task is [${t.state}], not workable.`);
    const ex = s.protocol().executor?.command;
    if (ex) {
      const t0 = Date.now();
      try { execSync(ex, { cwd: workdir(s, t), input: buildContext(s, t), stdio: ['pipe', 'inherit', 'inherit'], timeout: 10 * 60 * 1000 }); } catch { /* gate decides */ }
      s.logCost({ taskId: t.id, stage: 'work', agent: 'executor', ms: Date.now() - t0 });
    }
    const v = runVerify(s, { cwd: workdir(s, t) });
    if (!v.green) { console.error(C.r('✗ ') + 'verify RED after work — gate closed.'); process.exit(2); }
    // Test-enforcement gate: a green verify can be vacuous, so a feature change must add/change a test.
    // Exit 2 → the pipeline auto-blocks (needs:human-input) with this reason surfaced (diagnosable).
    if (missingRequiredTest(s, t)) {
      console.error(C.r('✗ ') + 'no test in the change — a feature must add or change a test (verify can pass vacuously). Add one, lock a test, or label the issue `skip-test`.');
      process.exit(2);
    }
    t.pipeline = { ...(t.pipeline || {}), stage: 'verified', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Worked + verified: ${t.title}`, taskId: t.id });
    ok(`worked ${C.b(t.title)} — verify green ✓`);
  },

  // GitHub pipeline — gated squash-merge + cleanup + done. The GATES are the only safety:
  // verify green ∧ (if required) review pass ∧ (if required) held-out audit green.
  merge({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const gh0 = s.protocol().github || {};
    // Idempotent on resume: if a prior run already merged + cleaned, don't re-run the gates against a
    // torn-down branch — just report done. (Guard precedes the in-progress check, which a done task fails.)
    if (stageDone(t, 'cleaned')) return ok(`merge ${C.dim('(already done)')}`);
    // Must be in-progress: verify only checks integrity (P6) + e2e (P4) for in-progress tasks, so
    // merging a done/specd/blocked task would vacuously pass those gates. Require it explicitly.
    if (t.state !== 'in-progress') die(`merge requires an in-progress, verified task (this is [${t.state}]).`);
    if (!t.pr?.number) die('no PR — run `chalk pr <id>` first.');
    if (!runVerify(s, { cwd: workdir(s, t) }).green) die('GATE: verify is not green — cannot merge.');
    if (reviewRequiredNow(s, t) && !((t.reviews || []).slice(-1)[0]?.verdict === 'pass')) die('GATE P5: a passing review is required before merge.');
    const reg = s.protocol().regression;
    if (reg?.required && !(reg.lastAudit && reg.lastAudit.green)) die('GATE P7: held-out audit is not green — run `chalk audit`.');
    try { runGh(workdir(s, t), gh0.command, `pr merge ${t.pr.number} --${gh0.mergeMethod || 'squash'} --delete-branch`); }
    catch (e) {
      // `--delete-branch` can fail (e.g. a worktree still holds the local branch) even though the
      // squash-merge SUCCEEDED — don't die on that. Only fail if the PR didn't actually merge.
      let merged = false;
      try { merged = /MERGED/i.test(runGh(s.root, gh0.command, `pr view ${t.pr.number} --json state -q .state`)); } catch { /* gh down */ }
      if (!merged) die(`gh pr merge failed: ${String(e.message).split('\n').slice(-2).join(' ')}`);
    }
    // Sync the primary base branch (best-effort) then tear down the worktree + local branch. A
    // failure here is non-fatal (the remote is source of truth) but is surfaced, not swallowed.
    try { runGit(s.root, `checkout ${gh0.base || 'main'}`); runGit(s.root, 'pull --ff-only'); }
    catch { console.log(C.y(`  ⚠ couldn't fast-forward ${gh0.base || 'main'} locally — pull it manually (the remote is up to date).`)); }
    worktreeRemove(s.root, { dir: t.worktree && t.worktree !== s.root ? t.worktree : undefined, branch: t.branch });
    t.worktree = undefined; t.state = 'done'; t.doneAt = now();
    t.pipeline = { ...(t.pipeline || {}), stage: 'cleaned', at: now() };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'work-item-accepted', title: `Merged + cleaned: PR #${t.pr.number}`, taskId: t.id });
    ok(`merged ${C.b('#' + t.pr.number)} (${gh0.mergeMethod || 'squash'}) + cleaned up ✓`);
  },

  // The scheduled-run unit (for cron / launchd / `/loop`): locked + doctor-gated + one bounded
  // pipeline sweep. Safe to call on a schedule — it self-skips when not ready or already running.
  autopilot({ flags }) {
    const s = Store.open();
    console.log(C.b('chalk autopilot') + C.dim(` · ${now()}`));
    const r = runAutopilot(s, process.argv[1], { max: Number(flags.max || 3), retro: flags['no-retro'] !== true, minSeverity: String(flags['min-severity'] || 'med'), log: (m) => console.log(C.dim('  ' + m)) });
    if (r.skipped) { console.log(C.y('  another autopilot run is in progress — skipping.')); process.exit(0); }
    if (r.notReady) { console.log(C.r(`  NOT READY — ${r.fails.length} blocker(s); skipping (run \`chalk doctor\`).`)); process.exit(2); }
    syncBrowser(s);
    console.log(`  ${C.g(`✓ ${r.merged.length} merged`)}  ${r.blocked.length ? C.y(`⊘ ${r.blocked.length} blocked`) + '  ' : ''}${C.dim('(gates are the safety)')}`);
    s.emitUpdate({ type: 'progress-update', title: `Autopilot: ${r.merged.length} merged, ${r.blocked.length} blocked` });
    process.exit(0);
  },

  // The bounded STANDING loop — drives several autopilot rounds (each: pull issues → sweep → read the
  // retro convergence marker) until steady state, a skipped/not-ready sweep, or the round cap. This is
  // what a cron / launchd entry should call to let the loop self-drive; it self-terminates by design.
  loop({ flags }) {
    const s = Store.open();
    console.log(C.b('chalk loop') + C.dim(` · ${now()} · ≤${Number(flags['max-rounds'] || 5)} rounds`));
    const r = runLoop(s, process.argv[1], {
      maxRounds: Number(flags['max-rounds'] || 5),
      max: Number(flags.max || 3),
      minSeverity: String(flags['min-severity'] || 'med'),
      log: (m) => console.log(C.dim('  ' + m)),
    });
    syncBrowser(s);
    const conv = r.rounds.slice(-1)[0]?.converged;
    console.log(`  ${C.g(`✓ ${r.totalMerged} merged`)}${r.totalBlocked ? '  ' + C.y(`⊘ ${r.totalBlocked} blocked`) : ''}  ${C.dim(`over ${r.rounds.length} round(s)${conv ? ' · converged' : ''}`)}`);
    s.emitUpdate({ type: 'progress-update', title: `Loop: ${r.totalMerged} merged, ${r.totalBlocked} blocked over ${r.rounds.length} round(s)` });
    process.exit(0);
  },

  // Self-healing retrospective — a read-only retro agent distills durable LESSONS from the recent run
  // and proposes ISSUES for the chalk defects/friction it exposed; chalk appends the lessons and files
  // the issues (capped + deduped). The loop thus finds its own bugs and the next sweep fixes them.
  retro({ flags }) {
    const s = Store.open();
    const gh0 = s.protocol().github || {};
    const dry = flags['dry-run'] === true;
    const r = runRetro(s);
    if (r.status === 'unconfigured') die('no retro agent configured (protocol.retro.command).');
    if (r.status === 'error') die('retro agent did not return JSON. tail:\n' + C.dim(r.raw || '(empty)'));
    // Convergence guard: the retro is adversarial, so it will always find SOMETHING — a naked
    // standing loop would chase cosmetic nits forever. Only file issues at/above a severity floor
    // (default 'med'); defer the rest. An unrated issue defaults to 'med' so it still files (we don't
    // silently drop). A sweep that files nothing above the floor has "converged" — the signal the
    // standing loop reads (.chalk/local/retro-last.json) to know when to stop.
    const RANK = { low: 0, med: 1, high: 2 };
    const floor = RANK[String(flags['min-severity'] || 'med').toLowerCase()] ?? RANK.med;
    const sevOf = (iss) => RANK[String(iss.severity || 'med').toLowerCase()] ?? RANK.med;
    console.log(C.b('chalk retro') + (dry ? C.dim(' · dry-run') : '') + C.dim(` · min-severity ${Object.keys(RANK)[floor]}`));
    for (const lesson of r.lessons) { console.log(`  ${C.g('+')} lesson: ${C.dim(String(lesson).slice(0, 100))}`); if (!dry) s.appendLesson({ lesson, by: 'retro' }); }
    let open = [];
    try { open = JSON.parse(runGh(s.root, gh0.command, 'issue list --state open --json title --limit 100') || '[]').map((i) => i.title); } catch { /* gh down — skip dedup */ }
    let filed = 0, deferred = 0;
    for (const iss of (r.issues || []).slice(0, Number(flags['max-issues'] || 3))) {
      if (!iss.title) continue;
      if (sevOf(iss) < floor) { console.log(C.dim(`  · defer (below ${Object.keys(RANK)[floor]}): ${iss.title}`)); deferred++; continue; }
      if (open.some((t) => titlesSimilar(t, iss.title))) { console.log(C.dim(`  · skip (already open): ${iss.title}`)); continue; }
      if (dry) { console.log(`  ${C.y('~ would file:')} ${iss.title}`); filed++; continue; }
      const labels = (iss.labels || []).map((l) => `--label ${shq(l)}`).join(' ');
      try { const out = runGh(s.root, gh0.command, `issue create --title ${shq(iss.title)} --body ${shq((iss.body || '') + '\n\n_filed by `chalk retro` (self-healing)_')} ${labels}`); console.log(`  ${C.g('✓ filed:')} ${out.trim().split('\n').pop()}`); filed++; }
      catch (e) { console.log(C.r(`  ✗ file failed: ${String(e.message).split('\n').slice(-1)[0]}`)); }
    }
    // Convergence marker — the standing loop reads this to decide whether to keep sweeping.
    const converged = filed === 0;
    if (!dry) {
      try { const md = join(s.root, '.chalk', 'local'); mkdirSync(md, { recursive: true }); writeFileSync(join(md, 'retro-last.json'), JSON.stringify({ at: now(), lessons: r.lessons.length, filed, deferred, converged }, null, 2)); } catch { /* best-effort marker */ }
      syncBrowser(s);
    }
    ok(`retro: ${C.b(String(r.lessons.length))} lesson(s)${dry ? ' (dry-run)' : ''}, ${C.b(String(filed))} issue(s) ${dry ? 'would file' : 'filed'}${deferred ? `, ${C.b(String(deferred))} deferred` : ''}` + (converged ? C.dim(' · converged') : ''));
  },

  // Summarize the agent-call cost ledger (.chalk/local/cost.jsonl): calls + wall-clock per agent.
  // For a subscription this is a proxy (flat cost, rate-capped); for API, the Console is authoritative.
  cost() {
    const s = Store.open();
    const recs = s.costRecords();
    if (!recs.length) { console.log(C.dim('  no agent calls recorded yet (.chalk/local/cost.jsonl)')); return; }
    console.log(C.b('chalk cost') + C.dim(` · ${recs.length} agent call(s)`));
    const by = {};
    for (const r of recs) { const k = r.agent || '?'; (by[k] = by[k] || { n: 0, ms: 0 }); by[k].n++; by[k].ms += r.ms || 0; }
    for (const [agent, v] of Object.entries(by)) console.log(`  ${C.b(agent.padEnd(9))} ${v.n} call(s)  ${C.dim(`${(v.ms / 1000).toFixed(0)}s wall-clock`)}`);
    const total = recs.reduce((a, r) => a + (r.ms || 0), 0);
    console.log(C.dim(`  total: ${(total / 1000).toFixed(0)}s across ${recs.length} calls. Subscription = flat + rate-capped; bound a sweep with \`autopilot --max N\`.`));
  },

  // Preflight readiness check for autonomous operation (read-only). Exits non-zero on any FAIL.
  doctor() {
    const s = Store.open();
    const results = runDoctor(s);
    console.log(C.b('chalk doctor') + C.dim(' · autonomous-run readiness') + '\n');
    const icon = { ok: C.g('✓'), warn: C.y('⚠'), fail: C.r('✗') };
    for (const area of [...new Set(results.map((r) => r.area))]) {
      console.log(C.b(area));
      for (const r of results.filter((x) => x.area === area)) console.log(`  ${icon[r.level]} ${r.msg}`);
    }
    const fails = results.filter((r) => r.level === 'fail').length;
    const warns = results.filter((r) => r.level === 'warn').length;
    console.log('\n' + (fails ? C.r(`● NOT READY — ${fails} blocker(s)${warns ? `, ${warns} warning(s)` : ''}`) : warns ? C.y(`● READY with ${warns} warning(s)`) : C.g('● READY')));
    process.exit(fails ? 2 : 0);
  },

  // Sacrificial-issue smoke — prove the REAL pipeline works end-to-end before trusting it. The one
  // command that performs real outward-facing actions (PR + squash-merge): --yes-gated, scratch-repo.
  smoke({ flags }) {
    const s = Store.open();
    const r = runSmoke(s, process.argv[1], { issue: flags.issue, create: flags.create === true, yes: flags.yes === true, dryRun: flags['dry-run'] === true, log: (m) => console.log(C.dim('  ' + m)) });
    if (r.dryRun) { console.log(C.y(`  smoke runs the REAL pipeline + a squash-merge in ${C.b(r.repo)}. Re-run with ${C.b('--yes')} (use a SCRATCH repo).`)); return; }
    if (r.refused) die(`refused — smoke performs REAL gh actions (PR + squash-merge) in ${C.b(r.repo)}. Re-run with --yes, ideally on a scratch repo.`);
    console.log('\n' + C.b('chalk smoke · verification'));
    for (const [label, ok] of r.checks) console.log(`  ${ok ? C.g('✓') : C.r('✗')} ${label}`);
    console.log('\n' + (r.go ? C.g('● GO — the pipeline works end-to-end') : C.r('● NO-GO — see the failed checks above')));
    process.exit(r.go ? 0 : 2);
  },

  // GitHub pipeline — the unattended driver: walk every issue-backed task issue→merge, blocking
  // on any gate failure and continuing to the next. The safety is the gates, not a human.
  pipeline({ flags }) {
    const s = Store.open();
    const r = runPipeline(s, process.argv[1], { max: Number(flags.max || 20), dryRun: flags['dry-run'] === true, log: (m) => console.log(C.dim(m)) });
    if (r.dryRun) { console.log(C.dim(`  (${r.planned.length} task(s) planned — dry run, no changes)`)); return; }
    syncBrowser(s);
    console.log('\n' + C.b('chalk pipeline · summary'));
    console.log(`  ${C.g(`✓ ${r.merged.length} merged`)}  ${r.blocked.length ? C.y(`⊘ ${r.blocked.length} blocked`) + '  ' : ''}${C.dim('(gates are the safety)')}`);
    process.exit(r.blocked.length ? 2 : 0);
  },

  // GitHub pipeline — run the task's browser specs, attach step screenshots to the PR as
  // commit-SHA blob URLs (survive squash-merge + branch deletion). stage→tested.
  evidence({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'tested')) return ok(`evidence ${C.dim('(already done)')}`);
    const gh0 = s.protocol().github || {};
    const wd = workdir(s, t);
    if (!t.pr?.number) die('no PR — run `chalk pr <id>` first.');
    const specPaths = (t.tests || []).map((x) => x.path).filter((p) => p.endsWith('.test.yaml'));
    const results = runSpecs(s, wd, specPaths);
    const evDir = `.chalk/evidence/${t.issue?.number || t.id.slice(0, 12)}`;
    const imgs = [];
    for (const r of results) {
      try { imgs.push(...extractScreenshots(wd, evDir, JSON.parse(readFileSync(join(wd, r.runDir, 'run.json'), 'utf8')))); } catch { /* no screenshots */ }
    }
    if (imgs.length) {
      gitAdd(wd, imgs);
      gitCommit(wd, ['test(evidence): attach run screenshots']);
      try { runGit(wd, 'push'); } catch { /* offline / no upstream — body still composes from local SHA */ }
      const sha = runGit(wd, 'rev-parse HEAD');
      let body = '';
      try { body = runGh(wd, gh0.command, `pr view ${t.pr.number} --json body -q .body`); } catch { /* keep empty */ }
      try { runGh(wd, gh0.command, `pr edit ${t.pr.number} --body ${shq(body + evidenceMarkdown(currentRepo(s.root) || '', sha, imgs))}`); }
      catch (e) { die(`gh pr edit failed: ${String(e.message).split('\n').slice(-2).join(' ')}`); }
      t.evidence = imgs;
    }
    const failed = results.filter((r) => r.status !== 'passed').length;
    t.pipeline = { ...(t.pipeline || {}), stage: 'tested', at: now() };
    s.upsertTask(t);
    s.emitUpdate({ type: 'progress-update', title: `Evidence attached (${imgs.length} screenshot(s))`, taskId: t.id });
    if (failed) console.log(C.y(`  ⚠ ${failed} spec(s) failed`));
    ok(`evidence: ${C.b(String(imgs.length))} screenshot(s) → PR #${t.pr.number}`);
  },

  // GitHub pipeline — remove a task's worktree and delete its local branch (idempotent). Resets the
  // task so it is RE-RUNNABLE: a leftover `branch` field + `stage='cleaned'` would otherwise make the
  // next `chalk branch` no-op via its idempotency guard, stranding the task (Finding 3).
  cleanup({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const had = t.branch;
    worktreeRemove(s.root, { dir: t.worktree && t.worktree !== s.root ? t.worktree : undefined, branch: t.branch });
    t.worktree = undefined;
    // A completed (merged) task stays terminal; an aborted one rewinds to pre-branch so it can re-run.
    if (t.state !== 'done') { t.branch = undefined; t.pipeline = { ...(t.pipeline || {}), stage: 'selected', at: now() }; }
    else { t.pipeline = { ...(t.pipeline || {}), stage: 'cleaned', at: now() }; }
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Cleaned up: ${had || t.title}`, taskId: t.id });
    ok(`cleaned up ${C.dim(had || t.id.slice(0, 12))}`);
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
    const wip = s.tasks().find((t) => t.state === 'in-progress');
    const v = runVerify(s, { cwd: workdir(s, wip) });
    console.log(C.b('Verify') + (wip?.worktree ? C.dim(`  · in worktree ${wip.worktree}`) : '') + '\n');
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
    for (const r of v.e2e || []) console.log(`  ${r.status === 'passed' ? C.g('pass') : C.r('fail')}  ${C.dim('e2e')} ${r.path} ${C.dim(`→ ${r.runDir}`)}`);
    console.log('\n' + (v.green ? C.g('● GREEN — done gate is open') : C.r('● RED — done gate is closed')));
    process.exit(v.green ? 0 : 2);
  },

  // GATE P4 + P6 (+ P5) — done is impossible unless verify is green, locks intact, review passed.
  done({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (t.state !== 'in-progress') die(`task is [${t.state}], not in-progress.`);
    const v = runVerify(s, { cwd: workdir(s, t) });
    if (!v.green) {
      const reasons = [];
      if (!v.toolchainGreen) reasons.push('toolchain not green (run `chalk verify`)');
      if (!v.integrityGreen) reasons.push('locked tests were modified (P6) — use `chalk amend-spec`');
      if (!v.e2eGreen) reasons.push('a browser-spec (e2e) check failed');
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

    // Idempotent on resume: a passing review advances the stage to 'reviewed' (only on pass — a
    // block leaves the stage at 'pr-open' so the re-run after a fix re-reviews). So if we're already
    // past 'reviewed', short-circuit: don't re-invoke the reviewer or append a DUPLICATE review.
    if (stageDone(t, 'reviewed')) return ok(`review ${C.dim('(already passed)')}`);

    if (!meta.protocol?.review?.command) {
      const note = flags.note || _.slice(1).join(' ');
      if (!note) die('no reviewer configured. Set .chalk/chalk.json → protocol.review.command (e.g. "claude -p"),\n  or record a manual review:  chalk review <id> --note "..."');
      const verdict = flags.block ? 'block' : 'pass';
      t.reviews.push({ at: now(), by: flags.by || 'human', verdict, findings: [], note: String(note), checklist: ['test-adequacy', 'design-intent', 'regressions'] });
      if (verdict === 'pass') t.pipeline = { ...(t.pipeline || {}), stage: 'reviewed', at: now() };
      s.upsertTask(t);
      s.emitUpdate({ type: 'progress-update', title: `Review (manual): ${t.title}`, description: String(note), taskId: t.id });
      return ok('manual review recorded ' + C.dim('(checklist: test-adequacy · design-intent · regressions)'));
    }

    console.log(C.dim('  running adversarial reviewer…'));
    const r = runReview(s, t);
    if (r.status === 'error') die('reviewer did not return a valid JSON verdict. raw tail:\n' + C.dim(r.raw || '(empty)'));
    t.reviews.push({ at: now(), by: 'adversary', verdict: r.verdict, findings: r.findings });
    if (r.verdict === 'pass') t.pipeline = { ...(t.pipeline || {}), stage: 'reviewed', at: now() };
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

  // Read-only: print the durable decision log (.chalk/decisions.md).
  decisions() {
    const s = Store.open();
    const text = s.decisions().trim();
    console.log(text || 'no decisions recorded yet.');
  },

  // Add a durable lesson to .chalk/lessons.md — injected into every agent's context so the loop
  // stops repeating mistakes. The `retro` stage appends these programmatically too.
  lesson({ _, flags }) {
    const s = Store.open();
    if (_[0] === 'add') {
      // Explicit subcommand so a single-word payload (e.g. "list") is recorded verbatim
      // instead of being misrouted to the list branch below.
      const text = _.slice(1).join(' ') || flags.text;
      if (!text) die('usage: chalk lesson add "<what to remember>"');
      s.appendLesson({ lesson: text, by: flags.by || 'human' });
      return ok(`lesson recorded ${C.dim(`(${s.lessons().length} total)`)}`);
    }
    if (_[0] === 'list' && _.length === 1) {
      // Default mirrors the injected set (Store.lessons() cap) so the list matches what agents
      // actually see; --all shows the full append-only history.
      const lessons = flags.all ? s.lessons(Infinity) : s.lessons();
      if (!lessons.length) { console.log(C.dim('no lessons recorded yet.')); return; }
      for (const l of lessons) console.log(l);
      return;
    }
    const text = _.join(' ') || flags.text;
    if (!text) die('usage: chalk lesson "<what to remember>"');
    s.appendLesson({ lesson: text, by: flags.by || 'human' });
    ok(`lesson recorded ${C.dim(`(${s.lessons().length} total)`)}`);
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
    let all = s.updates();
    if (flags.type) all = all.filter((u) => u.type === flags.type);
    if (flags.grep) all = all.filter((u) => String(u.title).toLowerCase().includes(String(flags.grep).toLowerCase()));
    const recent = all.slice(-n);
    const ordered = flags.reverse === true ? recent.slice().reverse() : recent;
    if (flags.json === true) { for (const u of ordered) console.log(JSON.stringify(u)); return; }
    for (const u of ordered) console.log(`${C.dim(u.at.slice(0, 16))}  ${C.dim(`[${u.type}]`)} ${u.title}`);
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
// Shell single-quote (for titles/bodies passed to gh).
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
// Branch-name slug: lowercase, non-alphanumeric → '-', trimmed, max ~4 words.
function pipelineSlug(title) {
  return (String(title || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 5).join('-')) || 'task';
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
  chalk branch <id>                    ${C.dim('create <type>/<issue>-<slug> branch + git worktree')}
  chalk commit <id>                    ${C.dim('conventional commit of the worktree changes (Closes #issue)')}
  chalk pr <id>                        ${C.dim('push the branch + open a PR (gh)')}
  chalk evidence <id>                  ${C.dim('run specs + attach screenshots to the PR (blob-SHA URLs)')}
  chalk plan <id>                      ${C.dim('read-only planner picks the approach → task.plan (BYO planner)')}
  chalk work <id>                      ${C.dim('run the executor in the worktree + verify (P4)')}
  chalk merge <id>                     ${C.dim('GATED squash-merge + cleanup + done')}
  chalk cleanup <id>                   ${C.dim('remove the task worktree + delete its local branch')}
  chalk pipeline [--max N] [--dry-run] ${C.dim('UNATTENDED: drive every issue-backed task issue→merge')}
  chalk doctor                         ${C.dim('preflight readiness check for autonomous runs (read-only)')}
  chalk cost                           ${C.dim('summarize the agent-call ledger (calls + wall-clock per agent)')}
  chalk retro [--dry-run] [--max-issues N]   ${C.dim('self-heal: distill lessons + file improvement issues (BYO retro agent)')}
  chalk autopilot [--max N] [--min-severity med]   ${C.dim('scheduled-run unit: locked + doctor-gated pipeline sweep (for cron//loop)')}
  chalk loop [--max-rounds N] [--max N] [--min-severity med]   ${C.dim('bounded STANDING loop: pull→sweep→converge, self-terminating')}
  chalk smoke [--create|--issue N] --yes   ${C.dim('prove the pipeline on ONE throwaway issue (real; use a scratch repo)')}
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
  chalk decisions                       ${C.dim('print the durable decision log')}
  chalk lesson "<what to remember>"     ${C.dim('add to the lessons memory injected into every agent')}
  chalk lesson add "<what to remember>" ${C.dim('explicit add (records verbatim, even single-word text like "list")')}
  chalk lesson list [--all]             ${C.dim('print the lessons injected into agents (--all = full history)')}
  chalk question add "<q>" [--for us|client] | resolve <id> "<answer>" | (list)
  chalk log [--n N] [--type T] [--grep TEXT] [--reverse] [--json]

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
