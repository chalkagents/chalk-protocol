#!/usr/bin/env node
// Chalk Protocol CLI (v0). Drives an agent through read → work → verify → write.
// The protocol's whole value is in the GATES: start (P1), done (P4+P6), amend-spec (P6).
import { resolve, join } from 'node:path';
import { Store, initSpine, installAgentDocs, findRoot, now, id, PROTOCOL, PHASES, TASK_STATES, NEEDS, UPDATE_TYPES, depsSatisfied, runnableTasks, resolveRef, workdir, buildContext } from '../lib/store.mjs';
import { verify as runVerify } from '../lib/verify.mjs';
import { runReview } from '../lib/review.mjs';
import { runAudit, codeSize, heldOutFloor, lockFile, listDirFiles, buildGuardPrompt } from '../lib/regression.mjs';
import { projectPlans } from '../lib/plans.mjs';
import { projectBoard } from '../lib/boards.mjs';
import { PRESETS, detectPreset, withRunner, reviewCadences, normGate } from '../lib/config.mjs';
import { runDriver } from '../lib/run.mjs';
import { gh as runGh, git as runGit, gitAdd, gitCommit, changedPaths, diffPaths, worktreeAdd, worktreeRemove, currentRepo, gitTry } from '../lib/git.mjs';
import { buildPrBody, prNarrative } from '../lib/prbody.mjs';
import { postReviewToPr } from '../lib/prreview.mjs';
import { brokeCheck } from '../lib/brokecheck.mjs';
import { mergeBlockers } from '../lib/mergegate.mjs';
import { extractQuestions, planApprovalRequired } from '../lib/planning.mjs';
import { releasableTasks, bumpVersion, renderReleaseNotes, latestSemverTag } from '../lib/release.mjs';
import { runSpecs } from '../lib/e2e.mjs';
import { extractScreenshots, evidenceMarkdown } from '../lib/evidence.mjs';
import { runPipeline } from '../lib/pipeline.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { runSmoke } from '../lib/smoke.mjs';
import { runAutopilot } from '../lib/autopilot.mjs';
import { runLoop } from '../lib/loop.mjs';
import { missingRequiredTest } from '../lib/testgate.mjs';
import { runBreakit } from '../lib/breakit.mjs';
import { runMutation } from '../lib/mutation.mjs';
import { writeHandoff, overAttemptBudget } from '../lib/handoff.mjs';
import { runRetro, titlesSimilar } from '../lib/retro.mjs';
import { collectSignals, runFeedback, feedbackDir } from '../lib/feedback.mjs';
import { runDiscovery } from '../lib/discovery.mjs';
import { runDemo } from '../lib/demo.mjs';
import { installClaudeAgents, manualLoopText } from '../lib/onboard.mjs';
import { runArchive } from '../lib/archive.mjs';
import { portalModel } from '../lib/portal.mjs';
import { basename, dirname, relative } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
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
  // Pre-init command (no Store): the 1-minute stub-agent lifecycle demo, incl. two gate refusals.
  demo({ flags }) {
    try { runDemo({ keep: flags.keep === true }); }
    catch (e) { die(String(e.message || e)); }
  },

  init({ flags }) {
    const root = process.cwd();
    // Preset resolution: explicit --preset X wins; bare --preset OR no flag at all auto-detects from
    // marker files (the path of least resistance must be the safe one); --bare opts out explicitly.
    const bare = flags.bare === true;
    let preset = flags.preset === true ? detectPreset(root)
      : flags.preset ? String(flags.preset)
      : bare ? null : detectPreset(root);
    const auto = !!preset && (flags.preset === true || !flags.preset);
    // The user explicitly asked for detection (bare --preset) and got nothing — say so.
    if (flags.preset === true && !preset) console.error(C.y('  could not detect a preset (no pubspec.yaml / go.mod / package.json / pyproject.toml found) — proceeding without one.'));
    if (preset && !PRESETS[preset]) die(`unknown --preset: ${preset} (choose ${Object.keys(PRESETS).join('|')})`);
    // --executor claude|opencode|none: scaffold a runnable agent setup (or explicitly skip one).
    const executor = flags.executor ? String(flags.executor) : undefined;
    if (executor && !['claude', 'opencode', 'none'].includes(executor)) die(`unknown --executor: ${executor} (supported: claude|opencode|none)`);
    const meta = initSpine(root, { name: flags.name, goal: flags.goal, preset, runner: flags.runner ? String(flags.runner) : undefined, executor });
    // --verify-test "<cmd>": set the one required gate inline, no chalk.json editing needed.
    if (flags['verify-test'] && flags['verify-test'] !== true) {
      meta.protocol.verify.test = String(flags['verify-test']);
      writeFileSync(join(root, '.chalk', 'chalk.json'), JSON.stringify(meta, null, 2));
    }
    ok(`initialized .chalk/ for ${C.b(meta.project.name)} (protocol ${meta.protocol.version})${preset ? C.dim(` · preset ${preset}${auto ? ' (auto-detected — override with --preset <stack> or --bare)' : ''}`) : ''}`);
    if (executor === 'opencode') console.log(C.dim('  opencode executor configured · set CHALK_OPENCODE_MODEL (e.g. anthropic/claude-opus-4-8); see docs/integrations/opencode.md'));
    if (executor === 'claude') {
      for (const r of installClaudeAgents(root)) console.log(C.dim(`  ${r.action} .claude/agents/${r.name}`));
      console.log(C.dim('  claude executor + planner + retro + REQUIRED per-task reviewer wired (needs the `claude` CLI on PATH)'));
    }
    if (executor === 'none') console.log(C.dim(manualLoopText()));
    if (flags['no-agents'] !== true) {
      for (const r of installAgentDocs(root)) console.log(C.dim(`  ${r.action} ${r.name} (agent contract)`));
    }
    // The vacuous-verify trap, surfaced at the source: an empty protocol.verify means every
    // `chalk verify` prints GREEN while checking NOTHING. Warn loudly unless --bare acknowledged it.
    const verifyEmpty = !Object.values(meta.protocol.verify).some((v) => normGate(v).cmd);
    if (verifyEmpty && !bare) {
      console.error(C.r('⚠ protocol.verify is EMPTY — every `chalk verify` will pass VACUOUSLY (green while checking nothing).'));
      console.error(C.y('  no stack detected (looked for pubspec.yaml, go.mod, package.json, pyproject.toml/requirements.txt). Fix:'));
      console.error(C.y('    set protocol.verify.test in .chalk/chalk.json (e.g. "npm test"),'));
      console.error(C.y('    or re-run in a scaffolded project, or use `chalk init --verify-test "<cmd>"` next time.'));
      console.error(C.dim('  (--bare acknowledges an intentionally empty verify and silences this warning)'));
    }
    console.log(`\n${C.b('next steps')}
  1. chalk task add "<what to build>"                ${C.dim('queue the first task')}
  2. chalk spec <id> --criterion "..." --test <path> ${C.dim('criteria + LOCK the test (P1/P2)')}
  3. chalk start <id>  → write code                  ${C.dim('(or `chalk run` if an executor is configured)')}
  4. chalk verify  →  chalk done <id>                ${C.dim('the gate decides, not you')}
${C.dim('  preflight readiness: chalk doctor · watch the whole loop first: chalk demo')}`);
  },

  // (Re)install the agent contract into AGENTS.md / CLAUDE.md. --claude additionally installs the
  // shipped Claude Code agent definitions — the retrofit path for a project inited without them.
  agents({ flags = {} } = {}) {
    const s = Store.open();
    for (const r of installAgentDocs(s.root)) ok(`${r.action} ${r.name}`);
    if (flags.claude === true) {
      for (const r of installClaudeAgents(s.root)) ok(`${r.action} .claude/agents/${r.name}`);
      console.log(C.dim('  wire the commands in .chalk/chalk.json → protocol.{executor,planner,review,retro}.command (see docs/integrations/claude-code.md)'));
    }
    console.log(C.dim('  any CLI (Claude Code, Codex, Gemini) will now auto-load the Chalk contract.'));
  },

  // Print the protocol version on its own line.
  version() {
    console.log(PROTOCOL);
  },

  // The single command an agent calls to learn its next action (which gate is blocking).
  next({ flags = {} } = {}) {
    const s = Store.open();
    const tasks = s.tasks();
    const wip = tasks.filter((t) => t.state === 'in-progress');
    const specd = tasks.filter((t) => t.state === 'specd');
    const ready = specd.filter((t) => depsSatisfied(t, tasks));   // deps done → startable now
    const waiting = specd.filter((t) => !depsSatisfied(t, tasks)); // specd but blocked behind deps
    const todo = tasks.filter((t) => t.state === 'todo');
    // Machine-readable signal for an orchestrator: which task to run, and that it should run in a
    // FRESH session (one session per task) seeded with the task's latest handoff, if any.
    if (flags.json) {
      const pick = wip[0] || ready[0] || null; // in-progress first, else the next runnable
      const t = pick && { id: pick.id, title: pick.title, state: pick.state };
      const handoff = pick?.handoff?.path || null;
      const action = pick ? (pick.state === 'in-progress' ? 'work' : 'start') : null;
      console.log(JSON.stringify({ task: t || null, freshSession: true, handoff, action }));
      return;
    }
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
    const gh0 = s.protocol().github || {};
    if (stageDone(t, 'pr-open')) {
      // Back-compat: a PR opened before recordings existed has no `recorded` flag and `chalk pr`
      // used to no-op here — leaving it permanently stuck at the merge gate. Backfill it from the
      // committed diff so the merge can proceed.
      if (t.pr && t.pr.recorded === undefined) {
        t.pr.recorded = diffPaths(workdir(s, t), gh0.base || 'main').length > 0;
        s.upsertTask(t);
      }
      return ok(`PR ${C.b('#' + (t.pr?.number || '?'))} ${C.dim('(already open)')}`);
    }
    const wd = workdir(s, t);
    if (!t.branch) die('no branch — run `chalk branch <id>` first.');
    try { runGit(wd, `push -u origin ${t.branch}`); } catch (e) { die(`git push failed: ${String(e.message).split('\n').slice(-2).join(' ')}`); }
    const type = t.branchType || 'feat';
    const title = `${type}: ${(t.title || '').replace(/^\s*(feat|fix|chore|docs|refactor|test|perf|style|build|ci)(\([^)]*\))?:\s*/i, '').replace(/^./, (c) => c.toLowerCase())}`;
    // The PR body is the "what was done" recording a human (and the merge gate) reads: summary +
    // narrative + the files the branch actually changed + criteria + test plan. The change set comes
    // from the committed diff vs base (working tree is clean post-commit). recorded=true gates merge.
    const changed = diffPaths(wd, gh0.base || 'main');
    const body = buildPrBody(s, t, { changed, narrative: prNarrative(s, t, changed) });
    // Quote each label — GitHub label names are attacker-controlled (from the issue) and may
    // contain shell metacharacters; an unquoted value would be command injection in an unattended run.
    const labels = (t.labels || []).map((l) => `--label ${shq(l)}`).join(' ');
    let out;
    try { out = runGh(wd, gh0.command, `pr create --base ${gh0.base || 'main'} --head ${t.branch} --title ${shq(title)} --body ${shq(body)} ${labels}`); }
    catch (e) { die(`gh pr create failed: ${String(e.message).split('\n').slice(-3).join('\n  ')}`); }
    const url = (out.match(/https?:\/\/\S+\/pull\/\d+/) || [out.trim()])[0];
    const number = Number((url.match(/\/pull\/(\d+)/) || [])[1]) || undefined;
    t.pr = { number, url, recorded: changed.length > 0 };
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
    // Planning is the human checkpoint: record the planner's clarifying questions so a human can
    // validate scope (and `chalk approve-plan` can gate work on them). Skip ones already on file.
    const newQs = extractQuestions(planText);
    if (newQs.length) {
      const qs = s.questions();
      const existing = new Set(qs.map((q) => q.question));
      for (const text of newQs) if (!existing.has(text)) qs.push({ id: id('q'), question: text, awaitingFrom: 'human', status: 'open', taskId: t.id, at: now() });
      s.saveQuestions(qs);
    }
    const qNote = newQs.length ? C.y(` · ${newQs.length} scoping question(s) → answer & \`chalk approve-plan\``) : '';
    ok(`plan ready ${C.dim(`(${planText.split('\n').length} lines)`)}${qNote}`);
  },

  // Plan-approval gate (the human checkpoint). Marks a task's plan approved so `work` may proceed.
  // Refuses without a plan, or with open scoping questions still unanswered (unless --force --why).
  'approve-plan'({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (!t.plan) die('no plan to approve — run `chalk plan <id>` first.');
    const openQ = s.questions().filter((q) => q.taskId === t.id && q.status !== 'resolved');
    if (openQ.length && !flags.force) {
      console.error(C.r('✗ ') + `${openQ.length} open scoping question(s) — answer them first (chalk question resolve <id> "..."), or --force --why "...":`);
      for (const q of openQ) console.error(`    ? ${q.question}`);
      process.exit(1);
    }
    if (openQ.length && flags.force) {
      if (!flags.why) die('--force requires --why "<reason>" (logged as a decision).');
      s.appendDecision({ title: `Approved plan for "${t.title}" with ${openQ.length} open question(s)`, why: String(flags.why) });
    }
    t.planApproved = { at: now(), by: flags.by || 'human' };
    s.upsertTask(t); syncBrowser(s);
    s.emitUpdate({ type: 'progress-update', title: `Plan approved: ${t.title}`, taskId: t.id });
    ok(`plan approved ${C.dim(`for ${t.title}`)} — \`chalk work ${t.id.slice(0, 12)}\` may proceed`);
  },

  // Release stage — turn the merged, done work into a shipped release: a CHANGELOG entry + semver
  // bump (from the change types) + a git tag, marking each task `released` so it's idempotent.
  release({ flags }) {
    const s = Store.open();
    const tasks = releasableTasks(s);
    if (!tasks.length) return ok('release — nothing to ship (no done tasks awaiting release).');

    const pkgPath = join(s.root, 'package.json');
    let pkg = null, current = '0.0.0';
    if (existsSync(pkgPath)) { try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); current = pkg.version || current; } catch { /* malformed → 0.0.0 */ } }
    else { try { current = latestSemverTag(runGit(s.root, "tag --list 'v[0-9]*'")) || current; } catch { /* non-git → 0.0.0 */ } } // non-Node: derive from tags so the version advances
    const level = flags.major ? 'major' : flags.minor ? 'minor' : flags.patch ? 'patch' : undefined;
    const version = bumpVersion(current, tasks, { version: typeof flags.version === 'string' ? flags.version : undefined, level });
    const notes = renderReleaseNotes(tasks, version, now().slice(0, 10));

    // --dry-run: preview the version + notes and stop — no CHANGELOG, no bump, no tag, no marking.
    if (flags['dry-run'] === true) {
      console.log(notes.trimEnd());
      return ok(`release ${C.b('v' + version)} ${C.dim(`(dry-run) — ${tasks.length} change(s); nothing written`)}`);
    }

    // Tag FIRST — a colliding version is the most likely failure, and it must not leave work marked
    // "released" on a version with no tag (the next release, seeing them marked, would never re-tag). A
    // non-git project legitimately can't tag (a CHANGELOG/pkg-only release); in a git repo a tag failure is
    // fatal BEFORE anything is written or marked.
    let tagged = false;
    const isRepo = gitTry(s.root, 'rev-parse --is-inside-work-tree') === 'true';
    if (flags['no-tag'] !== true && isRepo) {
      try { runGit(s.root, `tag -a v${version} -m ${shq('release v' + version)}`); tagged = true; }
      catch (e) { die(`release: git tag v${version} failed — ${String(e.message || e).split('\n')[0]}.\n    Likely the tag already exists; bump past it (--version/--major/…) or re-run with --no-tag. Nothing was released.`); }
    }

    // CHANGELOG.md — keep the title line, prepend the new section above older ones.
    const clPath = join(s.root, 'CHANGELOG.md');
    const prev = existsSync(clPath) ? readFileSync(clPath, 'utf8') : '# Changelog\n';
    const nl = prev.indexOf('\n');
    const title = prev.startsWith('# ') && nl >= 0 ? prev.slice(0, nl + 1) : '# Changelog\n';
    const older = prev.startsWith('# ') && nl >= 0 ? prev.slice(nl + 1).replace(/^\n+/, '') : prev;
    writeFileSync(clPath, `${title}\n${notes}\n${older}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');

    if (pkg) { pkg.version = version; writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); }

    for (const t of tasks) { t.released = version; s.upsertTask(t); }
    s.appendDecision({ title: `Released v${version}`, why: `${tasks.length} change(s)${tagged ? `; tagged v${version}` : ''}` });
    s.emitUpdate({ type: 'work-item-accepted', title: `Released v${version} (${tasks.length} change(s))` });
    console.log(notes.trimEnd());
    ok(`released ${C.b('v' + version)} ${C.dim(`— ${tasks.length} change(s), CHANGELOG updated${tagged ? `, tagged v${version}` : ''}`)}`);
  },

  // GitHub pipeline — start (if needed) + run the executor in the worktree + verify. exit 2 RED.
  work({ _ }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    if (stageDone(t, 'verified')) return ok(`work ${C.b(t.title)} ${C.dim('(already verified)')}`);
    // Plan-approval gate (the human checkpoint): when planning is required, no code is written until a
    // human has approved the plan. Checked BEFORE the state flip so a refusal leaves no side effect.
    // Exit 2 → the pipeline auto-blocks (needs:human-input) + handoff.
    if (planApprovalRequired(s, t)) {
      console.error(C.r('✗ ') + 'plan not approved — a human must run `chalk approve-plan ' + t.id.slice(0, 12) + '` (answer the scoping questions first).');
      process.exit(2);
    }
    if (t.state === 'todo' || t.state === 'specd') {
      if (!((t.acceptanceCriteria || []).length || (t.tests || []).length)) die('GATE P1: task has no acceptance criteria.');
      t.state = 'in-progress'; t.startedAt = now(); s.upsertTask(t);
    }
    if (t.state !== 'in-progress') die(`task is [${t.state}], not workable.`);
    const ex = s.protocol().executor?.command;
    if (ex) {
      t.attempts = (t.attempts || 0) + 1; s.upsertTask(t);   // churn budget: each work run counts
      const t0 = Date.now();
      try { execSync(ex, { cwd: workdir(s, t), input: buildContext(s, t), stdio: ['pipe', 'inherit', 'inherit'], timeout: 10 * 60 * 1000 }); } catch { /* gate decides */ }
      s.logCost({ taskId: t.id, stage: 'work', agent: 'executor', ms: Date.now() - t0 });
    }
    const v = runVerify(s, { cwd: workdir(s, t) });
    if (!v.green) {
      const churn = overAttemptBudget(s, t) ? ` (churn — ${t.attempts} attempts without green; resume in a FRESH session)` : '';
      console.error(C.r('✗ ') + `verify RED after work — gate closed.${churn}`);
      process.exit(2);
    }
    // Test-enforcement gate: a green verify can be vacuous, so a feature change must add/change a test.
    // Exit 2 → the pipeline auto-blocks (needs:human-input) with this reason surfaced (diagnosable).
    if (missingRequiredTest(s, t)) {
      console.error(C.r('✗ ') + 'no test in the change — a feature must add or change a test (verify can pass vacuously). Add one, lock a test, or label the issue `skip-test`.');
      process.exit(2);
    }
    // Lever 3 — break-it: a locked test must FAIL against the reverted (pre-change) code, else it
    // asserts nothing about the feature. Opt-in (protocol.breakTest); a vacuous test exits 2 → block.
    const bi = runBreakit(s, t, { cwd: workdir(s, t) });
    if (!bi.skipped && bi.inconclusive?.length) {
      console.error(C.y('⚠ ') + `break-it probe INCONCLUSIVE for ${bi.inconclusive.join(', ')} — the probe command could not run (is protocol.breakTest on PATH? did it time out?). Not counted as passing.`);
    }
    if (!bi.skipped && bi.vacuous.length) {
      console.error(C.r('✗ ') + `vacuous locked test — still passes against the pre-change code, so it asserts nothing: ${bi.vacuous.join(', ')}. Strengthen it to fail without your change.`);
      process.exit(2);
    }
    // Lever 3, rigorous — mutation adequacy: seed faults into the CHANGED code; surviving mutants mean the
    // tests don't pin it (coverage can be 100% with a near-zero mutation score). Opt-in (protocol.mutation).
    const mut = runMutation(s, t, { cwd: workdir(s, t) });
    if (!mut.skipped && mut.inconclusive?.length) {
      console.error(C.y('⚠ ') + `mutation probe INCONCLUSIVE for ${mut.inconclusive.join(', ')} — the tool could not run (is protocol.mutation on PATH? did it time out?). Not counted as adequate.`);
    }
    if (!mut.skipped && mut.survived.length) {
      console.error(C.r('✗ ') + `weak tests — mutants survived in: ${mut.survived.join(', ')}. The suite doesn't pin this change; strengthen the assertions (or kill the mutants).`);
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
    // Broke-check: did something break? Remote CI when the PR has it, else local verify. Replaces the
    // bare verify gate (its fallback IS local verify, so non-CI projects behave as before).
    const broke = brokeCheck(s, t);
    if (broke.source === 'local') console.log(C.y('  ⚠ ') + C.dim('PR has no remote CI checks — merge safety used LOCAL verify.'));
    const reviewReq = reviewRequiredNow(s, t);
    // If the review passed but the LGTM wasn't surfaced on the PR yet (review predated the PR, or a
    // gh hiccup), post it now so the gate can confirm a sign-off precedes the merge.
    if (reviewReq && !t.pr?.lgtm && (t.reviews || []).slice(-1)[0]?.verdict === 'pass') {
      const p = postReviewToPr(s, t, { verdict: 'pass', findings: [] });
      if (p.lgtm) { t.pr = { ...t.pr, lgtm: true }; s.upsertTask(t); }
      else console.log(C.y(`  ⚠ couldn't post the LGTM comment (${p.reason || 'gh'}); merging on the passing review verdict.`));
    }
    const blockers = mergeBlockers(s, t, { reviewRequired: reviewReq, broke });
    if (blockers.length) die(`GATE: cannot merge —\n  - ${blockers.join('\n  - ')}`);
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
  // Spine compaction: move done+released tasks (and their events) into .chalk/archive/ so the
  // working spine stays small on long-lived projects. Everything is kept, nothing deleted.
  archive({ flags }) {
    const s = Store.open();
    const r = runArchive(s, { dryRun: flags['dry-run'] === true });
    for (const k of r.keptWithReason) console.log(C.y('  ⚠ kept ') + `${k.task.title} ${C.dim(`(${k.reason})`)}`);
    if (!r.archived.length) return ok(`archive: nothing to move ${C.dim('(a task archives once it is done AND released)')}`);
    if (r.dryRun) {
      for (const t of r.archived) console.log(`  ${C.y('~ would archive:')} ${t.title} ${C.dim(`(v${t.released})`)}`);
      return ok(`archive (dry-run): ${C.b(r.archived.length)} task(s), ${r.events} event line(s) — nothing written`);
    }
    ok(`archived ${C.b(r.archived.length)} task(s) + ${r.events} event line(s) → ${C.dim(r.files.map((f) => relative(s.root, f)).join(', '))}`);
    syncBrowser(s);
  },

  doctor({ flags = {} } = {}) {
    const s = Store.open();
    const results = runDoctor(s);
    const fails = results.filter((r) => r.level === 'fail').length;
    // --json: the bug-report format (issue templates ask for it) — stable, greppable, exit-coded.
    if (flags.json === true) {
      console.log(JSON.stringify({ at: now(), node: process.version, platform: process.platform, results }, null, 2));
      process.exit(fails ? 2 : 0);
    }
    console.log(C.b('chalk doctor') + C.dim(' · autonomous-run readiness') + '\n');
    const icon = { ok: C.g('✓'), warn: C.y('⚠'), fail: C.r('✗'), info: C.dim('·') };
    for (const area of [...new Set(results.map((r) => r.area))]) {
      console.log(C.b(area));
      for (const r of results.filter((x) => x.area === area)) console.log(`  ${icon[r.level]} ${r.level === 'info' ? C.dim(r.msg) : r.msg}`);
    }
    const warns = results.filter((r) => r.level === 'warn').length;
    console.log('\n' + (fails ? C.r(`● NOT READY — ${fails} blocker(s)${warns ? `, ${warns} warning(s)` : ''}`) : warns ? C.y(`● READY with ${warns} warning(s)`) : C.g('● READY')));
    if (fails) console.log(C.dim('  NOT READY concerns UNATTENDED runs (chalk run/pipeline) — the manual loop works regardless: chalk next'));
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
    // A blocked task never finishes in this session — leave a handoff so a fresh one can pick it up.
    // The pipeline auto-blocks by shelling out to this command, so that path is covered here too.
    const rec = writeHandoff(s, t, { reason: needs, note: String(flags.reason) });
    ok(`blocked ${C.b(t.title)} ${C.dim(`— needs ${needs}`)} ${C.dim(`· handoff ${rec.path}`)}`);
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

  // Write a handoff doc so a FRESH session can pick up this task (context minification: one session
  // per task). Template-first; an optional BYO protocol.handoff.command enriches the narrative.
  handoff({ _, flags }) {
    const s = Store.open();
    const t = mustTask(s, _[0]);
    const rec = writeHandoff(s, t, { reason: String(flags.reason || 'manual'), note: flags.note ? String(flags.note) : '' });
    ok(`handoff written ${C.dim(`(${rec.reason})`)} → ${C.b(rec.path)}`);
    console.log(C.dim(`  pick up in a fresh session: chalk context ${t.id.slice(0, 12)}`));
  },

  // Discovery / intake — the front door. Turn a product brief into a scoped backlog: each proposed
  // task becomes a SPECD chalk task with acceptance criteria + milestone (deps resolved by title).
  // The plan-approval gate then lets a human validate the generated scope before any code is written.
  discover({ _, flags }) {
    const s = Store.open();
    let fileBrief = '';
    if (flags.file) { try { fileBrief = readFileSync(resolve(process.cwd(), String(flags.file)), 'utf8'); } catch { die(`--file: cannot read ${flags.file}`); } }
    const brief = fileBrief || (typeof flags.input === 'string' ? flags.input : '') || _.join(' ');
    if (!brief.trim()) die('usage: chalk discover "<product brief>"  (or --input "..." / --file <path>)');
    const dry = flags['dry-run'] === true;
    const r = runDiscovery(s, brief.trim());
    if (r.status === 'unconfigured') die('no discovery agent configured (protocol.discovery.command).');
    if (r.status === 'error') die('discovery agent did not return JSON. tail:\n' + C.dim(r.raw || '(empty)'));
    console.log(C.b('chalk discover') + (dry ? C.dim(' · dry-run') : '') + (r.spec ? C.dim(` · ${r.spec.slice(0, 80)}`) : ''));

    const existing = s.tasks();
    const created = []; // { title, id|null, after, task? }
    let skipped = 0;
    for (const t of r.tasks) {
      if (existing.some((x) => titlesSimilar(x.title, t.title)) || created.some((c) => titlesSimilar(c.title, t.title))) {
        console.log(C.dim(`  · skip (similar exists): ${t.title}`)); skipped++; continue;
      }
      const meta = C.dim(`(${t.criteria.length} crit${t.milestone ? `, ${t.milestone}` : ''})`);
      if (dry) { console.log(`  ${C.y('~ would add:')} ${t.title} ${meta}`); created.push({ title: t.title, id: null, after: t.after }); continue; }
      const task = { id: id('task'), title: t.title, state: 'specd', acceptanceCriteria: t.criteria.map((text) => ({ text })), tests: [], heldOut: [], milestone: t.milestone, after: [], createdAt: now(), reviews: [] };
      s.upsertTask(task);
      created.push({ title: t.title, id: task.id, after: t.after, task });
      console.log(`  ${C.g('+ added:')} ${t.title} ${meta}`);
    }
    // Resolve each task's after-titles to dependency ids (created this run or already existing).
    if (!dry) {
      const resolveTitle = (title) => (created.find((x) => x.id && titlesSimilar(x.title, title))?.id) || (existing.find((x) => titlesSimilar(x.title, title))?.id) || null;
      for (const c of created) {
        if (!c.id || !c.after?.length) continue;
        const deps = c.after.map(resolveTitle).filter(Boolean);
        if (deps.length) { c.task.after = Array.from(new Set(deps)); s.upsertTask(c.task); }
      }
      syncBrowser(s);
    }
    const n = created.filter((c) => dry || c.id).length;
    ok(`discover: ${C.b(String(n))} task(s) ${dry ? 'proposed' : 'added'}${skipped ? `, ${skipped} skipped` : ''}` + (dry || !n ? '' : C.dim(' — review, then `chalk approve-plan` / `chalk next`')));
  },

  // Feedback loop — close the product cycle. Collect external signals (.chalk/feedback/ + --input),
  // run the analysis agent, and file improvement issues into the backlog (dedup + severity floor +
  // dry-run, same convergence discipline as `chalk retro`), then archive the processed signals.
  feedback({ flags }) {
    const s = Store.open();
    const gh0 = s.protocol().github || {};
    const dry = flags['dry-run'] === true;
    const { digest, files } = collectSignals(s, { input: typeof flags.input === 'string' ? flags.input : '' });
    if (!digest.trim()) return ok('feedback — no signals (drop files in .chalk/feedback/ or pass --input "...").');
    const r = runFeedback(s, digest);
    if (r.status === 'unconfigured') die('no feedback agent configured (protocol.feedback.command).');
    if (r.status === 'error') die('feedback agent did not return JSON. tail:\n' + C.dim(r.raw || '(empty)'));
    const RANK = { low: 0, med: 1, high: 2 };
    const floor = RANK[String(flags['min-severity'] || 'med').toLowerCase()] ?? RANK.med;
    const sevOf = (iss) => RANK[String(iss.severity || 'med').toLowerCase()] ?? RANK.med;
    console.log(C.b('chalk feedback') + (dry ? C.dim(' · dry-run') : '') + C.dim(` · ${files.length} signal file(s) · min-severity ${Object.keys(RANK)[floor]}`));
    let open = [];
    try { open = JSON.parse(runGh(s.root, gh0.command, 'issue list --state open --json title --limit 100') || '[]').map((i) => i.title); } catch { /* gh down — skip dedup */ }
    let filed = 0, deferred = 0;
    for (const iss of (r.issues || []).slice(0, Number(flags['max-issues'] || 5))) {
      if (!iss.title) continue;
      if (sevOf(iss) < floor) { console.log(C.dim(`  · defer (below ${Object.keys(RANK)[floor]}): ${iss.title}`)); deferred++; continue; }
      if (open.some((t) => titlesSimilar(t, iss.title))) { console.log(C.dim(`  · skip (already open): ${iss.title}`)); continue; }
      if (dry) { console.log(`  ${C.y('~ would file:')} ${iss.title}`); filed++; continue; }
      const labels = (iss.labels || []).map((l) => `--label ${shq(l)}`).join(' ');
      try { const out = runGh(s.root, gh0.command, `issue create --title ${shq(iss.title)} --body ${shq((iss.body || '') + '\n\n_filed by `chalk feedback` (product loop)_')} ${labels}`); console.log(`  ${C.g('✓ filed:')} ${out.trim().split('\n').pop()}`); filed++; }
      catch (e) { console.log(C.r(`  ✗ file failed: ${String(e.message).split('\n').slice(-1)[0]}`)); }
    }
    // Archive the processed signals so a re-run doesn't re-analyze them (idempotency).
    if (!dry && files.length) {
      const arch = join(feedbackDir(s), 'archive'); mkdirSync(arch, { recursive: true });
      for (const f of files) { try { renameSync(f, join(arch, f.split('/').pop())); } catch { /* leave it */ } }
    }
    if (!dry) syncBrowser(s);
    ok(`feedback: ${C.b(String(filed))} issue(s) ${dry ? 'would file' : 'filed'}${deferred ? `, ${C.b(String(deferred))} deferred` : ''}${!dry && files.length ? `, ${files.length} signal(s) archived` : ''}`);
  },

  // Stakeholder portal — publish the spine as client-facing portal data. Deterministically maps tasks/
  // milestones/the update log to the Chalk Projects portal schema and writes the .project/ files.
  portal({ flags }) {
    const s = Store.open();
    const out = String(flags.out || s.protocol().portal?.dir || '.project');
    // resolve() (not join) so an ABSOLUTE --out is honored as-is; a relative one is root-relative.
    const outBase = resolve(s.root, out);
    const dry = flags['dry-run'] === true;
    const m = portalModel(s, { slug: typeof flags.slug === 'string' ? flags.slug : undefined });
    const files = {
      [`projects/${m.slug}.yaml`]: m.meta,
      'scope/defined.yaml': m.scope,
      'updates/extracted.yaml': m.updates,
      'milestones.yaml': m.milestones,
    };
    console.log(C.b('chalk portal') + (dry ? C.dim(' · dry-run') : '') + C.dim(` · ${m.slug} → ${outBase}/`));
    console.log(C.dim(`  scope ${m.scope.length} · milestones ${m.milestones.length} · updates ${m.updates.length}`));
    if (dry) { for (const p of Object.keys(files)) console.log(`  ${C.y('~ would write:')} ${join(outBase, p)}`); return ok(`portal: ${m.scope.length} scope, ${m.milestones.length} milestone(s), ${m.updates.length} update(s) ${C.dim('(dry-run)')}`); }
    for (const [rel, data] of Object.entries(files)) {
      const abs = join(outBase, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, JSON.stringify(data, null, 2) + '\n'); // JSON is valid YAML — robust + zero-dep
      console.log(`  ${C.g('✓')} ${join(out, rel)}`);
    }
    syncBrowser(s);
    ok(`portal: wrote ${C.b(String(Object.keys(files).length))} file(s) to ${out}/ ${C.dim(`(${m.scope.length} scope, ${m.milestones.length} ms, ${m.updates.length} updates)`)}`);
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
    // A green made of nothing is a trap, not a pass — label it every time it prints. An e2e spec
    // that actually RAN is a real check, so its green is not vacuous even with an empty toolchain.
    if (v.green && v.toolchain.every((r) => r.status === 'skipped') && !(v.e2e || []).length) {
      console.log(C.y('  ⚠ VACUOUS — no verify commands configured; this green checked NOTHING. Set protocol.verify.test in .chalk/chalk.json (or `chalk init --preset <stack>` on a fresh project).'));
    }
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
    // A changed locked test INVALIDATES a prior passing review: the adversary approved a different test, so
    // that verdict is stale. Mark it (a non-'pass' last verdict) so `done`/merge require a fresh review —
    // closing the bypass "get a pass, then weaken the locked test, then merge on the stale approval" (P5/P6).
    const lastReview = (t.reviews || []).slice(-1)[0];
    if (lastReview && lastReview.verdict === 'pass') {
      t.reviews.push({ at: now(), by: 'amend-spec', verdict: 'stale', note: 'locked test amended after review — re-review required' });
      console.log(C.y('  ! prior passing review invalidated — re-review required before done.'));
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
    // past 'reviewed', short-circuit: don't re-invoke the reviewer or append a DUPLICATE review. But only
    // while the last verdict still STANDS — `amend-spec` invalidates a prior pass (verdict 'stale'), and a
    // changed locked test must be re-reviewed even though the stage is still 'reviewed'.
    if (stageDone(t, 'reviewed') && t.reviews.slice(-1)[0]?.verdict === 'pass') return ok(`review ${C.dim('(already passed)')}`);

    if (!meta.protocol?.review?.command) {
      const note = flags.note || _.slice(1).join(' ');
      if (!note) die('no reviewer configured. Set .chalk/chalk.json → protocol.review.command (e.g. "claude -p"),\n  or record a manual review:  chalk review <id> --note "..."');
      const verdict = flags.block ? 'block' : 'pass';
      t.reviews.push({ at: now(), by: flags.by || 'human', verdict, findings: [], note: String(note), checklist: ['test-adequacy', 'design-intent', 'regressions'] });
      if (verdict === 'pass') t.pipeline = { ...(t.pipeline || {}), stage: 'reviewed', at: now() };
      const mp = postReviewToPr(s, t, { verdict, findings: [] });
      if (mp.lgtm) t.pr = { ...(t.pr || {}), lgtm: true };
      s.upsertTask(t);
      s.emitUpdate({ type: 'progress-update', title: `Review (manual): ${t.title}`, description: String(note), taskId: t.id });
      return ok('manual review recorded ' + C.dim('(checklist: test-adequacy · design-intent · regressions)') + (mp.posted ? C.dim(' · posted to PR') : ''));
    }

    console.log(C.dim('  running adversarial reviewer…'));
    let r = runReview(s, t);
    if (r.status === 'error' && !flags['no-retry']) {
      // A transient reviewer failure — a dropped/truncated response or a momentary bad parse — is not a
      // verdict, so retry once so a flake doesn't sink the review; only a SECOND consecutive error is fatal.
      // The pipeline passes --no-retry: it retries the whole review STAGE itself, so an inner retry would
      // double the reviewer calls it accounts for.
      console.log(C.dim('  reviewer returned no valid verdict — retrying once…'));
      r = runReview(s, t);
    }
    if (r.status === 'error') die('reviewer did not return a valid JSON verdict. raw tail:\n' + C.dim(r.raw || '(empty)'));
    t.reviews.push({ at: now(), by: 'adversary', verdict: r.verdict, findings: r.findings });
    if (r.verdict === 'pass') t.pipeline = { ...(t.pipeline || {}), stage: 'reviewed', at: now() };
    // Surface the verdict ON the PR (findings on block, LGTM on pass) so it's visible where a human
    // reviews — and record the LGTM signal the merge gate requires.
    const posted = postReviewToPr(s, t, { verdict: r.verdict, findings: r.findings });
    if (posted.lgtm) t.pr = { ...(t.pr || {}), lgtm: true };
    s.upsertTask(t);
    s.emitUpdate({ type: 'progress-update', title: `Review (${r.verdict}): ${t.title}`, taskId: t.id });
    console.log((r.verdict === 'pass' ? C.g('● review PASS') : C.r('● review BLOCK')) + ` ${C.dim(t.title)}` + (posted.posted ? C.dim(' · posted to PR') : ''));
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
    // P7 stringency scales with code size (SpecBench): warn (non-fatal — audit is about correctness) when
    // the held-out set has not grown with the code. The `phase` gate turns this into a refusal.
    const heldCount = s.protocol().regression?.tests?.length || 0;
    const floorNow = heldOutFloor(r.size.loc, s.protocol().regression?.locPerTest);
    if (floorNow > heldCount) console.log(C.y(`  ⚠ held-out set (${heldCount}) is below the size floor (${floorNow} for ${r.size.loc} LOC) — P7 stringency scales with code; author more via \`chalk guard\`.`));
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
      // P7 stringency scales with code size (SpecBench): the held-out set must GROW with the code, so a set
      // below the size floor blocks advance even when the audit is green — the oracle has decayed.
      const floor = heldOutFloor(size.loc, reg.locPerTest);
      const understaffed = (reg.tests?.length || 0) < floor;
      if (!la || !la.green || changed || understaffed) {
        if (!flags['force-audit']) {
          const msg = (!la || !la.green || changed)
            ? `run a green \`chalk audit\` before advancing phase (${!la ? 'never audited' : !la.green ? 'last audit was RED' : 'code changed since last audit'})`
            : `held-out set too small for ${size.loc} LOC — need ≥${floor} held-out test(s), have ${reg.tests?.length || 0}; P7 stringency scales with code size (author more via \`chalk guard\`)`;
          die(`GATE P7: ${msg}.\n    To override (logged): chalk phase ${p} --force-audit --why "..."`);
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
  chalk demo [--keep]                  ${C.dim('watch the whole gated loop on a throwaway project (~1 min, no LLM needed)')}
  chalk init [--name N] [--goal G] [--preset flutter|node|dart|python|go] [--verify-test "cmd"] [--bare] [--runner fvm] [--executor claude|opencode|none]
                                       ${C.dim('auto-detects the stack preset (verify/regression/break-it); --executor claude ships the agent files')}
  chalk agents [--claude]              ${C.dim('(re)install the agent contract; --claude adds the Claude Code agent definitions')}
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
  chalk doctor [--json]                ${C.dim('preflight readiness check for autonomous runs (read-only); --json for bug reports')}
  chalk cost                           ${C.dim('summarize the agent-call ledger (calls + wall-clock per agent)')}
  chalk archive [--dry-run]            ${C.dim('compact the spine: move done+released tasks (+their events) to .chalk/archive/')}
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
  chalk handoff <id> [--note "..."]    ${C.dim('write a handoff doc for a fresh session to pick up')}
  chalk approve-plan <id> [--force --why "..."]  ${C.dim('human checkpoint: approve the plan so work can start')}
  chalk release [--version x|--major|--minor|--patch] [--no-tag] [--dry-run]  ${C.dim('ship merged work: CHANGELOG + version + tag')}
  chalk discover "<brief>" [--file <path>] [--dry-run]  ${C.dim('intake: brief → scoped tasks with criteria')}
  chalk feedback [--input "..."] [--dry-run] [--min-severity low|med|high]  ${C.dim('signals → improvement issues')}
  chalk portal [--out <dir>] [--slug <slug>] [--dry-run]  ${C.dim('publish spine → client portal data')}

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
