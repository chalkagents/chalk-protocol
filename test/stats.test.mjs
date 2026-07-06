// chalk stats (#78) — the gate-efficacy report. Chalk never reported what its gates caught, so it
// could not prove its own value. `chalk stats` is a PURE READ over the spine (tasks.json +
// updates.jsonl) AND the archive (.chalk/archive/tasks-*.json / updates-*.jsonl) that reports:
// review-gate efficacy (reviewed tasks, blocked-then-passed catches, block verdicts, findings by
// severity/area), churn (executor attempts, handoffs — totals AND the worst offenders per task —
// and verify-RED blocks), and the gate-vs-bypass fraction over done tasks (passed adversarial
// review vs override vs unreviewed; landed through the pipeline vs by hand). `--json` emits the
// same numbers machine-readable; `--since <date>` restricts to tasks done and events emitted
// at/after the date and REJECTS an unparseable date; a fresh spine prints a friendly empty state
// and exits 0. Event matching is coupled to the emitters through lib/markers.mjs, and two tests
// drive the REAL emitters end-to-end (`chalk run` verify-RED block + handoff, `chalk done
// --force-review` override) so a reword at either side fails here instead of silently zeroing a
// stat. Locked contract for the task tracking issue #78.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HANDOFF_TITLE, BLOCKED_TITLE, VERIFY_RED_REASON, CHURN_REASON,
  REVIEW_OVERRIDE_TITLE, AUDIT_TITLE,
} from '../lib/markers.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

const F = (severity, area) => ({ severity, area, note: `${severity} ${area} finding` });
let evSeq = 0;
const EV = (at, type, title, extra = {}) => JSON.stringify({ id: `evt-${++evSeq}`, at, type, title, description: '', phase: 'delivery', actorRole: 'agent', ...extra });

// A spine with a hand-crafted gate history spanning the LIVE files and the ARCHIVE. Event titles
// and descriptions are built from lib/markers.mjs — the SAME constants the emitters use — so the
// fixture cannot drift from reality without this import breaking.
//  archived T0 — done 2025-06-01, blocked once then passed (1 high/correctness finding), PR #2,
//                pipeline stage 'cleaned'                          → caught, gated, pipeline-landed
//  live  T1 — done 2026-02-01, blocked (high/correctness + med/test-adequacy) then passed
//             (low/regression), 3 executor attempts + 1 handoff, PR #5, 'cleaned'
//                                                                  → caught, gated, pipeline-landed
//  live  T2 — done 2026-02-02, NO reviews, review gate OVERRIDDEN (decision event, by taskId)
//                                                                  → bypass: overridden
//  live  T3 — done 2026-01-05, passed first review, no PR, stage 'selected' → gated, hand-landed
//  live  T4 — in-progress, 1 attempt (contributes churn, not landing)
//  live  T5 — done 2026-02-03, no reviews, no override             → bypass: unreviewed
// Events: verify-RED block + handoff + audit-green live in 2026; a churn-worded verify-RED block
// and an audit-red archived in 2025 — totals prove the archive is read, --since proves the cutoff.
function seededRepo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  const reviews = (arr) => arr.map(([verdict, findings], i) => ({ at: `2026-01-0${i + 1}T00:00:00Z`, by: 'adversary', verdict, findings }));
  const T1 = { id: 'task-t1111111', title: 'feat: one', state: 'done', doneAt: '2026-02-01T00:00:00Z', attempts: 3, pr: { number: 5 }, pipeline: { stage: 'cleaned', at: '2026-02-01T00:00:00Z' }, reviews: reviews([['block', [F('high', 'correctness'), F('med', 'test-adequacy')]], ['pass', [F('low', 'regression')]]]) };
  const T2 = { id: 'task-t2222222', title: 'feat: two', state: 'done', doneAt: '2026-02-02T00:00:00Z', reviews: [] };
  const T0 = { id: 'task-t0000000', title: 'feat: zero', state: 'done', doneAt: '2025-06-01T00:00:00Z', released: true, pr: { number: 2 }, pipeline: { stage: 'cleaned', at: '2025-06-01T00:00:00Z' }, reviews: reviews([['block', [F('high', 'correctness')]], ['pass', []]]) };
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    T1, T2,
    { id: 'task-t3333333', title: 'feat: three', state: 'done', doneAt: '2026-01-05T00:00:00Z', pipeline: { stage: 'selected', at: '2026-01-05T00:00:00Z' }, reviews: reviews([['pass', []]]) },
    { id: 'task-t4444444', title: 'feat: four', state: 'in-progress', attempts: 1, reviews: [] },
    { id: 'task-t5555555', title: 'feat: five', state: 'done', doneAt: '2026-02-03T00:00:00Z', reviews: [] },
  ]));
  writeFileSync(join(d, '.chalk/updates.jsonl'), [
    EV('2026-02-01T01:00:00Z', 'progress-update', BLOCKED_TITLE(T1, 'human-input'), { description: VERIFY_RED_REASON, taskId: T1.id }),
    EV('2026-02-01T02:00:00Z', 'progress-update', HANDOFF_TITLE(T1), { taskId: T1.id }),
    EV('2026-02-01T03:00:00Z', 'progress-update', AUDIT_TITLE(true)),
    EV('2026-02-02T00:00:00Z', 'decision-logged', `Decision: ${REVIEW_OVERRIDE_TITLE(T2)}`, { description: 'shipping under deadline', taskId: T2.id }),
  ].join('\n') + '\n');
  mkdirSync(join(d, '.chalk/archive'), { recursive: true });
  writeFileSync(join(d, '.chalk/archive/tasks-2025.json'), JSON.stringify([T0]));
  writeFileSync(join(d, '.chalk/archive/updates-2025.jsonl'), [
    EV('2025-06-01T01:00:00Z', 'progress-update', BLOCKED_TITLE(T0, 'human-input'), { description: CHURN_REASON(3), taskId: T0.id }),
    EV('2025-06-02T00:00:00Z', 'progress-update', AUDIT_TITLE(false)),
  ].join('\n') + '\n');
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
  assert.equal(s.review.passes, 3);
  assert.equal(s.review.findings.total, 4);
  assert.equal(s.review.findings.bySeverity.high, 2);
  assert.equal(s.review.findings.bySeverity.med, 1);
  assert.equal(s.review.findings.bySeverity.low, 1);
  assert.equal(s.review.findings.byArea.correctness, 2, 'archive findings counted too');

  // Churn: attempts from tasks (3+1), verify-RED blocks from BOTH event files (one worded plain,
  // one churn-escalated), one handoff — and T1 tops the worst-offender list with both signals.
  assert.equal(s.churn.attempts, 4);
  assert.equal(s.churn.verifyRedBlocks, 2, 'the archived churn-worded verify-RED block is counted');
  assert.equal(s.churn.handoffs, 1);
  assert.equal(s.churn.worst.length, 1, 'T4 (1 attempt, no handoff) is not an offender');
  assert.deepEqual({ id: s.churn.worst[0].id, attempts: s.churn.worst[0].attempts, handoffs: s.churn.worst[0].handoffs }, { id: 'task-t1111111', attempts: 3, handoffs: 1 });

  // Gate-vs-bypass over the 5 done tasks: T0/T1/T3 gated, T2 overridden, T5 silently unreviewed.
  assert.equal(s.landing.done, 5);
  assert.equal(s.landing.gated, 3);
  assert.equal(s.landing.overridden, 1);
  assert.equal(s.landing.unreviewed, 1, 'done without the gate weighing in is its own bucket');
  assert.equal(s.landing.pipelineLanded, 2, 'T0 and T1 landed through the pipeline (PR + cleaned)');
  assert.equal(s.landing.handLanded, 3);

  assert.equal(s.audit.green, 1);
  assert.equal(s.audit.red, 1, 'the archived red audit is counted');
});

test('chalk stats — human report prints the same story, never writes the spine', () => {
  const d = seededRepo();
  const before = { tasks: readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), updates: readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8') };
  const r = chalk(d, 'stats');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /review/i, 'names the review gate');
  assert.match(r.out, /3\s*\/\s*5|60%/, 'the gated fraction over done tasks is stated');
  assert.match(r.out, /unreviewed/i, 'the silent-bypass bucket is surfaced');
  assert.match(r.out, /correctness/, 'findings broken down by area');
  assert.match(r.out, /high/, 'findings broken down by severity');
  assert.match(r.out, /task-t1111111|3 attempt/, 'the worst churn offender is listed');
  // Pure read: the spine files are byte-identical after the run.
  assert.equal(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), before.tasks, 'stats must not rewrite tasks.json');
  assert.equal(readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8'), before.updates, 'stats must not append events');
});

test('chalk stats --since — cuts tasks by doneAt and events by at; rejects a garbage date', () => {
  const d = seededRepo();
  const r = chalk(d, 'stats', '--json', '--since', '2026-01-01');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);
  assert.equal(s.landing.done, 4, 'archived T0 (done 2025) falls outside the window');
  assert.equal(s.review.caught, 1, 'only T1 remains a catch');
  assert.equal(s.churn.verifyRedBlocks, 1, 'the 2025 verify-RED block is cut');
  assert.equal(s.review.findings.byArea.correctness, 1, 'T0 findings are cut with it');
  assert.equal(s.audit.red, 0, 'the 2025 red audit is cut');
  // An unparseable --since must refuse loudly, not silently print the full history.
  const bad = chalk(d, 'stats', '--json', '--since', 'garbage');
  assert.notEqual(bad.code, 0, 'garbage --since must not exit 0');
  assert.match(bad.out, /since.*date|date.*since/i, 'says the date is the problem');
  assert.doesNotMatch(bad.out, /"landing"/, 'no full-history report mislabeled with the bogus window');
});

// The real emitters, end-to-end: `chalk run` with a stub executor and a failing verify writes the
// verify-RED block AND the handoff through lib/run.mjs + lib/handoff.mjs; stats must count both.
// Rewording either emitter without updating the parser (or vice versa) fails here.
test('chalk stats ← chalk run — a real verify-RED block and its handoff are counted', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'exec.mjs'), "import { readFileSync } from 'node:fs'; readFileSync(0); console.log('executor ran');");
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8'));
  o.protocol.executor = { command: `node ${join(d, 'exec.mjs')}` };
  o.protocol.verify = { ...o.protocol.verify, test: 'node -e "process.exit(1)"' };
  writeFileSync(f, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'specd', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [] }]));
  const run = chalk(d, 'run', '--max', '1');
  assert.match(run.out, /block/i, `the run must have blocked on RED verify: ${run.out}`);
  const r = chalk(d, 'stats', '--json');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);
  assert.equal(s.churn.verifyRedBlocks, 1, 'the block written by lib/run.mjs is recognized');
  assert.equal(s.churn.handoffs, 1, 'the handoff written by lib/handoff.mjs is recognized');
  assert.equal(s.churn.worst[0]?.handoffs, 1, 'the handoff is attributed to the task');
  assert.equal(s.landing.done, 0);
});

// And the override bypass, through the real `chalk done --force-review` decision emitter.
test('chalk stats ← chalk done --force-review — a real override decision lands in the bypass bucket', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8'));
  o.protocol.review = { ...o.protocol.review, requiredAt: ['per-task'] };
  writeFileSync(f, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], tests: [], reviews: [] }]));
  const done = chalk(d, 'done', 'task-aaaaaaaa', '--force-review', '--why', 'shipping under deadline');
  assert.equal(done.code, 0, done.out);
  const r = chalk(d, 'stats', '--json');
  assert.equal(r.code, 0, r.out);
  const s = JSON.parse(r.out);
  assert.equal(s.landing.done, 1);
  assert.equal(s.landing.overridden, 1, 'the decision written by chalk done is recognized (by taskId)');
  assert.equal(s.landing.gated, 0);
  assert.equal(s.landing.unreviewed, 0);
});

test('chalk stats — fresh spine: friendly empty state, exit 0', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-stats-'));
  chalk(d, 'init', '--name', 'demo');
  const r = chalk(d, 'stats');
  assert.equal(r.code, 0, `an empty spine must not throw: ${r.out}`);
  assert.match(r.out, /no (gate )?(activity|history|events|tasks)/i, 'a friendly empty-state message');
});
