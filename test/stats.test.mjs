// chalk stats (#78) — the gate-efficacy report. Chalk never reported what its gates caught, so it
// could not prove its own value. `chalk stats` is a PURE READ over the spine (tasks.json +
// updates.jsonl) AND the archive (.chalk/archive/tasks-*.json / updates-*.jsonl) that reports:
// review-gate efficacy (reviewed tasks, blocked-then-passed catches, block verdicts, findings by
// severity/area), churn (executor attempts, handoffs, verify-RED blocks), and the gate-vs-bypass
// fraction over done tasks (passed adversarial review vs override vs unreviewed; landed through
// the pipeline vs by hand). `--json` emits the same numbers machine-readable; `--since <date>`
// restricts to tasks done and events emitted at/after the date; a fresh spine prints a friendly
// empty state and exits 0. Locked contract for the task tracking issue #78.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

const F = (severity, area) => ({ severity, area, note: `${severity} ${area} finding` });
const EV = (at, type, title, extra = {}) => JSON.stringify({ id: `evt-${Math.abs(at.length + title.length)}`, at, type, title, description: '', phase: 'delivery', actorRole: 'agent', ...extra });

// A spine with a hand-crafted gate history spanning the LIVE files and the ARCHIVE:
//  archived T0 — done 2025-06-01, blocked once then passed (1 high/correctness finding), PR #2,
//                pipeline stage 'cleaned'                          → caught, gated, pipeline-landed
//  live  T1 — done 2026-02-01, blocked (high/correctness + med/test-adequacy) then passed
//             (low/regression), 3 executor attempts, PR #5, 'cleaned' → caught, gated, pipeline-landed
//  live  T2 — done 2026-02-02, NO reviews, review gate OVERRIDDEN (decision event) → bypass
//  live  T3 — done 2026-01-05, passed first review, no PR, stage 'selected' → gated, hand-landed
//  live  T4 — in-progress, 1 attempt (contributes churn, not landing)
// Events: one verify-RED block + one handoff + one audit-green live in 2026; one verify-RED block
// archived in 2025 — so totals prove the archive is read and --since proves the cutoff.
function seededRepo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  const reviews = (arr) => arr.map(([verdict, findings], i) => ({ at: `2026-01-0${i + 1}T00:00:00Z`, by: 'adversary', verdict, findings }));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-t1111111', title: 'feat: one', state: 'done', doneAt: '2026-02-01T00:00:00Z', attempts: 3, pr: { number: 5 }, pipeline: { stage: 'cleaned', at: '2026-02-01T00:00:00Z' }, reviews: reviews([['block', [F('high', 'correctness'), F('med', 'test-adequacy')]], ['pass', [F('low', 'regression')]]]) },
    { id: 'task-t2222222', title: 'feat: two', state: 'done', doneAt: '2026-02-02T00:00:00Z', reviews: [] },
    { id: 'task-t3333333', title: 'feat: three', state: 'done', doneAt: '2026-01-05T00:00:00Z', pipeline: { stage: 'selected', at: '2026-01-05T00:00:00Z' }, reviews: reviews([['pass', []]]) },
    { id: 'task-t4444444', title: 'feat: four', state: 'in-progress', attempts: 1, reviews: [] },
  ]));
  writeFileSync(join(d, '.chalk/updates.jsonl'), [
    EV('2026-02-01T01:00:00Z', 'progress-update', 'Blocked: feat: one (needs human-input)', { description: 'verify RED after executor', taskId: 'task-t1111111' }),
    EV('2026-02-01T02:00:00Z', 'progress-update', 'Handoff written: feat: one', { taskId: 'task-t1111111' }),
    EV('2026-02-01T03:00:00Z', 'progress-update', 'Audit green (held-out regression)'),
    EV('2026-02-02T00:00:00Z', 'decision-logged', 'Decision: Overrode review gate for "feat: two"', { description: 'shipping under deadline' }),
  ].join('\n') + '\n');
  mkdirSync(join(d, '.chalk/archive'), { recursive: true });
  writeFileSync(join(d, '.chalk/archive/tasks-2025.json'), JSON.stringify([
    { id: 'task-t0000000', title: 'feat: zero', state: 'done', doneAt: '2025-06-01T00:00:00Z', released: true, pr: { number: 2 }, pipeline: { stage: 'cleaned', at: '2025-06-01T00:00:00Z' }, reviews: reviews([['block', [F('high', 'correctness')]], ['pass', []]]) },
  ]));
  writeFileSync(join(d, '.chalk/archive/updates-2025.jsonl'), EV('2025-06-01T01:00:00Z', 'progress-update', 'Blocked: feat: zero (needs human-input)', { description: 'churn — 3 attempts without a green verify; resume in a FRESH session', taskId: 'task-t0000000' }) + '\n');
  return d;
}

test('chalk stats --json — review efficacy, churn, and gate-vs-bypass across live spine AND archive', () => {
  const d = seededRepo();
  const r = chalk(d, 'stats', '--json');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);

  // Review gate: T0+T1+T3 carry real verdicts; T0+T1 were blocked before passing — the catches.
  assert.equal(s.review.reviewed, 3, 'tasks with at least one real verdict');
  assert.equal(s.review.caught, 2, 'blocked at least once, then passed');
  assert.equal(s.review.blocks, 2);
  assert.equal(s.review.findings.total, 4);
  assert.equal(s.review.findings.bySeverity.high, 2);
  assert.equal(s.review.findings.bySeverity.med, 1);
  assert.equal(s.review.findings.bySeverity.low, 1);
  assert.equal(s.review.findings.byArea.correctness, 2, 'archive findings counted too');

  // Churn: attempts from tasks (3+1), verify-RED blocks from BOTH event files, one handoff.
  assert.equal(s.churn.attempts, 4);
  assert.equal(s.churn.verifyRedBlocks, 2, 'the archived verify-RED block is counted');
  assert.equal(s.churn.handoffs, 1);

  // Gate-vs-bypass over the 4 done tasks: T0/T1/T3 gated, T2 overridden, none silently unreviewed.
  assert.equal(s.landing.done, 4);
  assert.equal(s.landing.gated, 3);
  assert.equal(s.landing.overridden, 1);
  assert.equal(s.landing.unreviewed, 0);
  assert.equal(s.landing.pipelineLanded, 2, 'T0 and T1 landed through the pipeline (PR + cleaned)');

  assert.equal(s.audit.green, 1);
  assert.equal(s.audit.red, 0);
});

test('chalk stats — human report prints the same story, never writes the spine', () => {
  const d = seededRepo();
  const before = { tasks: readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), updates: readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8') };
  const r = chalk(d, 'stats');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /review/i, 'names the review gate');
  assert.match(r.out, /2/, 'the catch count appears');
  assert.match(r.out, /3\s*\/\s*4|75%/, 'the gated fraction over done tasks is stated');
  assert.match(r.out, /correctness/, 'findings broken down by area');
  assert.match(r.out, /high/, 'findings broken down by severity');
  // Pure read: the spine files are byte-identical after the run.
  assert.equal(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), before.tasks, 'stats must not rewrite tasks.json');
  assert.equal(readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8'), before.updates, 'stats must not append events');
});

test('chalk stats --since — cuts tasks by doneAt and events by at', () => {
  const d = seededRepo();
  const r = chalk(d, 'stats', '--json', '--since', '2026-01-01');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);
  assert.equal(s.landing.done, 3, 'archived T0 (done 2025) falls outside the window');
  assert.equal(s.review.caught, 1, 'only T1 remains a catch');
  assert.equal(s.churn.verifyRedBlocks, 1, 'the 2025 verify-RED block is cut');
  assert.equal(s.review.findings.byArea.correctness, 1, 'T0 findings are cut with it');
});

test('chalk stats — fresh spine: friendly empty state, exit 0', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  const r = chalk(d, 'stats');
  assert.equal(r.code, 0, `an empty spine must not throw: ${r.out}`);
  assert.match(r.out, /no (gate )?(activity|history|events|tasks)/i, 'a friendly empty-state message');
});
