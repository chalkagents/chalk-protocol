// A passing review clears a needs:review block (#117). The run loop parks a refuted task with
// needs:review (from #46), and next/status/backlog tell the agent to fix the findings then re-run
// `chalk review` — but `chalk review` never touched t.state/t.block, so a task whose re-review
// PASSED stayed state=blocked, runnableTasks kept skipping it, and an agent following the printed
// guidance exactly could end a sweep with a green-reviewed task still parked. Now a passing review
// on a needs:review-blocked task auto-unblocks it (restore blockedFrom, clear the block). This suite
// drives the full round trip — run-loop review block → fix → `chalk review` pass → runnable again →
// `chalk done` succeeds — plus the manual-reviewer path. Locked contract for issue #117.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const task0 = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const tid = (d) => task0(d).id.slice(0, 12);

test('run-loop review block → fix → `chalk review` pass → runnable again → done succeeds', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-unblk-'));
  chalk(d, 'init', '--name', 'p');
  // Executor writes a test file (so the test-enforcement gate is satisfied) — no-op otherwise.
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync,writeFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('f.test.js','// t\\n');`);
  // Reviewer BLOCKS while a BLOCK toggle file exists, PASSES once it's removed (the "fix").
  const toggle = join(d, 'BLOCK');
  writeFileSync(toggle, '');
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync,existsSync} from 'node:fs'; try{readFileSync(0)}catch{}
    const block=existsSync(${JSON.stringify(toggle)});
    console.log(JSON.stringify(block?{verdict:'block',findings:[{severity:'high',area:'correctness',note:'FINDING'}]}:{verdict:'pass',findings:[]}));`);
  conf(d, (o) => { o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });
  chalk(d, 'task', 'add', 'T');
  chalk(d, 'spec', tid(d), '--criterion', 'x');

  // The run loop reviews, gets a BLOCK, and parks the task with needs:review.
  chalk(d, 'run', '--max', '1');
  assert.equal(task0(d).state, 'blocked', 'refuted task is parked');
  assert.equal(task0(d).block.needs, 'review', 'parked with the review category (#46)');

  // Follow the printed guidance: fix the findings, then re-run `chalk review`.
  rmSync(toggle); // the "fix" — the reviewer will now pass
  const rev = chalk(d, 'review', tid(d));
  assert.equal(rev.code, 0, `re-review passes: ${rev.out}`);
  assert.match(rev.out, /review PASS/i);
  assert.match(rev.out, /runnable again|unblock|cleared/i, 'the pass announces the task is unblocked');

  // The block is gone and the task is workable again — no manual state surgery.
  assert.notEqual(task0(d).state, 'blocked', 'a passing review cleared the block');
  assert.equal(task0(d).state, 'in-progress', 'restored to its pre-block state');
  assert.ok(!task0(d).block, 'the block record is cleared');

  // And `chalk done` succeeds through the round trip (verify vacuous-green, review already passed).
  const done = chalk(d, 'done', tid(d));
  assert.equal(done.code, 0, `done succeeds after the round trip: ${done.out}`);
  assert.equal(task0(d).state, 'done');
});

test('manual reviewer path — a `--note` pass also clears a needs:review block', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-unblk-'));
  chalk(d, 'init', '--name', 'p');
  chalk(d, 'task', 'add', 'T');
  chalk(d, 'spec', tid(d), '--criterion', 'x');
  chalk(d, 'start', tid(d));
  // Hand-park it exactly as the run loop would (needs:review, blockedFrom in-progress).
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  t[0].state = 'blocked'; t[0].blockedFrom = 'in-progress'; t[0].block = { needs: 'review', reason: 'review block', at: '2026-01-01T00:00:00Z' };
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(t));
  // No reviewer configured → manual pass via --note (review.command stays empty).
  const rev = chalk(d, 'review', tid(d), '--note', 'looks good now');
  assert.equal(rev.code, 0, rev.out);
  assert.equal(task0(d).state, 'in-progress', 'the manual pass cleared the needs:review block');
  assert.ok(!task0(d).block);
});

test('a non-review block is NOT cleared by a passing review (only needs:review is agent-owned)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-unblk-'));
  chalk(d, 'init', '--name', 'p');
  chalk(d, 'task', 'add', 'T');
  chalk(d, 'spec', tid(d), '--criterion', 'x');
  chalk(d, 'start', tid(d));
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  t[0].state = 'blocked'; t[0].blockedFrom = 'in-progress'; t[0].block = { needs: 'human-input', reason: 'needs a credential', at: '2026-01-01T00:00:00Z' };
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(t));
  chalk(d, 'review', tid(d), '--note', 'looks good');
  assert.equal(task0(d).state, 'blocked', 'a human-input block is a real dependency — a review pass must not clear it');
  assert.equal(task0(d).block.needs, 'human-input');
});
