// Risk-based decision triage + the director inbox (#193) — the third director-harness mechanism. The
// decision digest (#192) surfaces the judgment calls the agent made; this scores each by risk
// (blast-radius × reversibility) and stands up `chalk pending`, the human's mirror of `chalk next`: the
// med/high-risk calls across all tasks, ranked, awaiting accept or redirect — so the empty middle is a
// place a human can direct instead of a set of choices the agent one-shots past. Locked for task-167041a.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionRisk, pendingDecisions } from '../lib/review.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

test('decisionRisk — blast-radius × reversibility → level; a missing field is the middle, not safe', () => {
  assert.equal(decisionRisk({ blastRadius: 'high', reversibility: 'hard' }), 'high');
  assert.equal(decisionRisk({ blastRadius: 'med', reversibility: 'hard' }), 'high');
  assert.equal(decisionRisk({ blastRadius: 'low', reversibility: 'easy' }), 'low');
  assert.equal(decisionRisk({ blastRadius: 'high', reversibility: 'easy' }), 'med');
  assert.equal(decisionRisk({ blastRadius: 'med', reversibility: 'easy' }), 'low');
  assert.equal(decisionRisk({}), 'med', 'both fields unknown → the middle (unknown is not safe)');
  assert.equal(decisionRisk({ blastRadius: 'high' }), 'high', 'high blast + unknown undo still surfaces');
});

test('pendingDecisions — ranks med/high across tasks, drops low + resolved, reads the LATEST review', () => {
  const tasks = [
    { id: 'task-aaaa1111', title: 'A', reviews: [{ decisions: [
      { choice: 'big irreversible call', blastRadius: 'high', reversibility: 'hard' }, // high
      { choice: 'a trivial rename', blastRadius: 'low', reversibility: 'easy' },        // low → excluded
      { choice: 'already accepted', blastRadius: 'high', reversibility: 'hard', accepted: { at: 'x' } }, // excluded
    ] }] },
    { id: 'task-bbbb2222', title: 'B', reviews: [
      { decisions: [{ choice: 'stale prior review', blastRadius: 'high', reversibility: 'hard' }] }, // superseded
      { decisions: [{ choice: 'a medium call', blastRadius: 'high', reversibility: 'easy' }] },       // med (latest)
    ] },
    { id: 'task-cccc3333', title: 'C', reviews: [] }, // no reviews → nothing
  ];
  const inbox = pendingDecisions(tasks);
  assert.equal(inbox.length, 2, 'one high (A) + one med (B-latest); low/accepted/superseded excluded');
  assert.equal(inbox[0].risk, 'high', 'highest risk ranked first');
  assert.equal(inbox[0].taskId, 'task-aaaa1111');
  assert.equal(inbox[0].index, 0, 'carries the decision index for the accept/redirect ref');
  assert.equal(inbox[1].risk, 'med');
  assert.equal(inbox[1].decision.choice, 'a medium call', 'reads the LATEST review, not the superseded one');
});

// A spine with tasks carrying review decisions of known risk.
function repo(decisions) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-triage-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-abc1234', title: 'feat: the thing', state: 'done',
    acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [{ verdict: 'pass', findings: [], decisions }],
  }]));
  return d;
}

test('chalk pending — lists med/high ranked with a ref; empty inbox reports cleanly', () => {
  const empty = repo([{ choice: 'trivial', blastRadius: 'low', reversibility: 'easy' }]);
  assert.match(chalk(empty, 'pending').out, /inbox empty/i, 'only-low → nothing to triage');

  const d = repo([
    { choice: 'chose a global singleton', blastRadius: 'high', reversibility: 'hard' },
    { choice: 'defaulted the timeout to 30s', blastRadius: 'high', reversibility: 'easy' }, // med
  ]);
  const r = chalk(d, 'pending');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Director inbox/i);
  assert.match(r.out, /chose a global singleton/);
  assert.match(r.out, /task-abc1234#0/, 'shows the accept/redirect ref');
  // highest risk first
  assert.ok(r.out.indexOf('global singleton') < r.out.indexOf('defaulted the timeout'), 'ranked high before med');
});

test('chalk pending accept — resolves a call and drops it from the inbox', () => {
  const d = repo([{ choice: 'chose a global singleton', blastRadius: 'high', reversibility: 'hard' }]);
  const r = chalk(d, 'pending', 'accept', 'task-abc1234#0');
  assert.equal(r.code, 0, r.out);
  assert.ok(tasksOf(d)[0].reviews[0].decisions[0].accepted?.at, 'the decision is marked accepted');
  assert.match(chalk(d, 'pending').out, /inbox empty/i, 'accepted call leaves the inbox');
  assert.notEqual(chalk(d, 'pending', 'accept', 'task-abc1234#0').code, 0, 'cannot re-accept a resolved call');
});

test('chalk pending redirect — records a course-correction and logs a decision', () => {
  const d = repo([{ choice: 'chose a global singleton', blastRadius: 'high', reversibility: 'hard' }]);
  assert.notEqual(chalk(d, 'pending', 'redirect', 'task-abc1234#0').code, 0, 'redirect needs a reason');
  const r = chalk(d, 'pending', 'redirect', 'task-abc1234#0', 'use dependency injection instead');
  assert.equal(r.code, 0, r.out);
  const dec = tasksOf(d)[0].reviews[0].decisions[0];
  assert.equal(dec.redirected?.why, 'use dependency injection instead');
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /use dependency injection instead/, 'the redirect is logged to the decision record');
  assert.match(chalk(d, 'pending').out, /inbox empty/i, 'redirected call leaves the inbox');
});
