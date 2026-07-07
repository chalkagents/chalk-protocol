// Manual-order review must not pollute the pipeline stage (#102). `chalk review` used to set
// pipeline.stage='reviewed' (rank 6) on any pass — so a review run BEFORE `chalk commit` (rank 4)
// and `chalk pr` (rank 5), the natural manual order once verify is green, made those stage guards
// no-op with nothing committed and no PR (`chalk pr` even printed "PR #?" as a success). Contract:
// the verdict is always recorded on t.reviews (what the done/merge gates read), but the stage only
// advances when the review happens in PIPELINE order (the PR exists); and `chalk pr`'s idempotency
// guard requires a REAL pr.number — a polluted stage falls through and actually opens the PR.
// Locked contract for task-124fde8a.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];

// A spine with one in-progress task at the given pipeline stage (no reviewer configured — the
// manual --note review path drives the same stage-advance line).
function repo(stage, extra = {}) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-revorder-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'in-progress',
    acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [],
    pipeline: { stage, at: '2026-01-01T00:00:00Z' }, ...extra,
  }]));
  return d;
}

test('review pass BEFORE the PR exists — verdict recorded, stage NOT fast-forwarded', () => {
  const d = repo('branched');
  const r = chalk(d, 'review', 'task-aaaaaaaa', '--note', 'manual pass, pre-PR');
  assert.equal(r.code, 0, `the manual review records: ${r.out}`);
  const t = taskOf(d);
  assert.equal(t.reviews.slice(-1)[0].verdict, 'pass', 'the verdict IS recorded — the done gate reads it');
  assert.equal(t.pipeline.stage, 'branched', 'the stage stays put: commit/pr still have work to do');
});

test('review pass in PIPELINE order (PR open) — the stage advances to reviewed as before', () => {
  const d = repo('pr-open', { pr: { number: 7, recorded: true } });
  const r = chalk(d, 'review', 'task-aaaaaaaa', '--note', 'manual pass, post-PR');
  assert.equal(r.code, 0, r.out);
  assert.equal(taskOf(d).pipeline.stage, 'reviewed', 'in pipeline order the stage advance is unchanged');
});

test('ADVERSARY review pass pre-PR — same rule on the reviewer path (verdict recorded, stage untouched)', () => {
  const d = repo('branched');
  writeFileSync(join(d, 'rev.mjs'), "console.log(JSON.stringify({ verdict: 'pass', findings: [] }));");
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.review = { ...(o.protocol.review || {}), command: `node ${join(d, 'rev.mjs')}` };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  const r = chalk(d, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `the adversary review passes: ${r.out}`);
  const t = taskOf(d);
  assert.equal(t.reviews.slice(-1)[0].verdict, 'pass', 'the adversary verdict is recorded');
  assert.equal(t.pipeline.stage, 'branched', 'the adversary path must not fast-forward the stage either');
});

test('chalk pr — a polluted stage (past pr-open, but NO pr) falls through instead of lying "already open"', () => {
  const d = repo('reviewed'); // the #102 pollution: stage says reviewed, but no PR was ever opened
  const r = chalk(d, 'pr', 'task-aaaaaaaa');
  assert.doesNotMatch(r.out, /already open/i, 'no false success');
  assert.doesNotMatch(r.out, /#\?/, 'no "PR #?" nonsense');
  // It genuinely tried to open one — in this fixture that dies at the missing branch, which is the
  // fall-through evidence (the guard used to return ok() before ever reaching this check).
  assert.notEqual(r.code, 0);
  assert.match(r.out, /no branch/i, 'the real pr-open path ran');
});

test('chalk pr — a REAL open PR still short-circuits idempotently (and backfills `recorded`)', () => {
  const d = repo('pr-open', { pr: { number: 7 } });
  const r = chalk(d, 'pr', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /#7.*already open/i, 'the legitimate no-op is intact');
  assert.notEqual(taskOf(d).pr.recorded, undefined, 'the back-compat recorded backfill still runs');
});
