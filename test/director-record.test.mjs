// The durable director-decision record (#201) — EPIC B foundation. accept/redirect (chalk pending,
// #193) live on t.reviews[].decisions, which runReview REGENERATES on every re-review — so an
// accepted/redirected flag there does not persist over a task's life (the #193 reviewer flagged this).
// This pins a durable, append-only .chalk/director.jsonl record that survives re-review and is the
// substrate the compounding-context moat (#202) reads from. Locked for task-e27fa89c.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPINE_STATE_PATHS } from '../lib/store.mjs';
import { REVIEW_DIFF_EXCLUDES } from '../lib/review.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const rec = (d) => { const f = join(d, '.chalk/director.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

// A done task carrying two review decisions of known risk (the #193 shape).
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-drec-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', state: 'done', acceptanceCriteria: [{ text: 'works' }], tests: [],
    reviews: [{ verdict: 'pass', findings: [], decisions: [
      { choice: 'chose a process-global cache', rationale: 'simplest', blastRadius: 'high', reversibility: 'hard' },
      { choice: 'defaulted TTL to 60s', rationale: 'convenient', blastRadius: 'high', reversibility: 'easy' },
    ] }],
  }]));
  return d;
}

test('chalk pending accept / redirect — write through to the durable director.jsonl record', () => {
  const d = repo();
  assert.equal(chalk(d, 'pending', 'accept', 'task-9f3a2b1c#0').code, 0);
  assert.equal(chalk(d, 'pending', 'redirect', 'task-9f3a2b1c#1', 'use an LRU with a size cap').code, 0);
  const recs = rec(d);
  assert.equal(recs.length, 2, 'both calls recorded durably');
  const acc = recs.find((r) => r.verdict === 'accepted');
  assert.equal(acc.choice, 'chose a process-global cache');
  assert.equal(acc.rationale, 'simplest', "an accepted call keeps the AGENT's original rationale");
  assert.equal(acc.risk, 'high', 'the computed risk is captured with the decision');
  assert.equal(acc.taskId, 'task-9f3a2b1c', 'the originating task is linked');
  assert.ok(acc.at && acc.by, 'provenance (when / who) is recorded');
  const red = recs.find((r) => r.verdict === 'redirected');
  assert.equal(red.instruction, 'use an LRU with a size cap', "a redirect stores the DIRECTOR's course-correction as `instruction`");
  assert.equal(red.rationale, 'convenient', "and preserves the agent's original rationale separately — the two are not conflated");
});

test('the durable record SURVIVES a re-review that regenerates t.reviews[].decisions', () => {
  const d = repo();
  chalk(d, 'pending', 'accept', 'task-9f3a2b1c#0');
  assert.equal(rec(d).length, 1, 'recorded on accept');
  // simulate a re-review: runReview replaces t.reviews with FRESH decisions (no accepted flag).
  const f = join(d, '.chalk/tasks.json'); const ts = JSON.parse(readFileSync(f, 'utf8'));
  ts[0].reviews = [{ verdict: 'pass', findings: [], decisions: [
    { choice: 'chose a process-global cache', blastRadius: 'high', reversibility: 'hard' },
  ] }];
  writeFileSync(f, JSON.stringify(ts));
  assert.ok(!ts[0].reviews[0].decisions[0].accepted, 're-review dropped the volatile per-review flag');
  const after = rec(d);
  assert.equal(after.length, 1, 'the durable director record persists across the re-review');
  assert.equal(after[0].verdict, 'accepted', 'and still remembers the call was accepted');
});

test('chalk decisions surfaces the director\'s calls', () => {
  const d = repo();
  chalk(d, 'pending', 'accept', 'task-9f3a2b1c#0');
  const out = chalk(d, 'decisions').out;
  assert.match(out, /Director's calls/i, 'the durable record has its own section');
  assert.match(out, /chose a process-global cache/, 'the call is listed');
});

test('director.jsonl is spine state — committed by intake and excluded from review diffs', () => {
  assert.ok(SPINE_STATE_PATHS.includes('.chalk/director.jsonl'), 'the durable record is part of the shared spine-state set');
  assert.ok(REVIEW_DIFF_EXCLUDES.some((e) => e.includes('director.jsonl')), 'so the reviewer never sees director bookkeeping churn');
});
