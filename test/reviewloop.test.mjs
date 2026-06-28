// The fix → re-verify → re-review loop. A genuine review block re-runs work (executor sees the
// findings via buildContext), commits the fix, and re-reviews — until it passes or the round budget
// is spent. These cover the loop's control flow (pass / exhaust / work-fails + the stage rewind that
// lets `work` re-run) and that buildContext surfaces a prior block's findings for the re-run.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFixLoop } from '../lib/reviewloop.mjs';

// A fake store recording the stages it was rewound to, and a fake `call` scripted per stage.
function fakeStore() {
  const task = { id: 't', pipeline: { stage: 'pr-open' } };
  const rewinds = [];
  return {
    root: '/x', rewinds,
    task: () => ({ ...task, pipeline: { ...task.pipeline } }),
    upsertTask: (t) => { task.pipeline = t.pipeline; rewinds.push(t.pipeline.stage); },
  };
}
function fakeCall(reviewStatuses, workStatus = 0) {
  let ri = 0;
  const fn = (_cli, _cwd, args) => {
    fn.calls.push(args[0]);
    if (args[0] === 'review') return { status: reviewStatuses[ri++] ?? 3 };
    if (args[0] === 'work') return { status: workStatus };
    return { status: 0 };
  };
  fn.calls = [];
  return fn;
}

test('reviewFixLoop — passes as soon as a re-review exits 0; rewinds the stage and PUSHES each round', () => {
  const store = fakeStore();
  const call = fakeCall([3, 0]); // round 1 still blocks, round 2 passes
  let pushes = 0; const push = () => { pushes++; };
  const r = reviewFixLoop({ store, ref: 't', call, cliPath: 'x', maxRounds: 3, push });
  assert.deepEqual(r, { passed: true, rounds: 2 });
  assert.equal(call.calls.filter((c) => c === 'work').length, 2, 'work re-ran each round');
  assert.equal(call.calls.filter((c) => c === 'review').length, 2);
  assert.ok(store.rewinds.every((s) => s === 'branched'), 'stage rewound to branched so work re-runs');
  assert.equal(pushes, 2, 'each round pushes the fix so merge sees the FIXED branch, not the stale one');
});

test('reviewFixLoop — gives up after the round budget is exhausted', () => {
  const call = fakeCall([3, 3, 3]);
  const r = reviewFixLoop({ store: fakeStore(), ref: 't', call, cliPath: 'x', maxRounds: 3 });
  assert.deepEqual(r, { passed: false, rounds: 3 });
  assert.equal(call.calls.filter((c) => c === 'work').length, 3);
});

test('reviewFixLoop — bails immediately when a work round fails', () => {
  const call = fakeCall([0], /* workStatus */ 1);
  const r = reviewFixLoop({ store: fakeStore(), ref: 't', call, cliPath: 'x', maxRounds: 3 });
  assert.deepEqual(r, { passed: false, rounds: 0 }, 'bails in round 1 with no completed round');
  assert.equal(call.calls.filter((c) => c === 'review').length, 0, 'no re-review after a failed work');
});

// --- buildContext surfaces a prior block's findings so the re-run executor fixes them ---
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });

test('buildContext — a prior blocking review surfaces its findings in `chalk context`', () => {
  const d = mkdtempSync(join(tmpdir(), 'reviewloop-'));
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'T');
  const f = join(d, '.chalk/tasks.json'); const ts = JSON.parse(readFileSync(f));
  const id = ts[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x'); chalk(d, 'start', id);
  const ts2 = JSON.parse(readFileSync(f));
  ts2[0].reviews = [{ verdict: 'block', findings: [{ severity: 'high', area: 'correctness', note: 'FIX-THE-PARSER' }] }];
  writeFileSync(f, JSON.stringify(ts2, null, 2));

  const ctx = chalk(d, 'context', id);
  const out = `${ctx.stdout}${ctx.stderr}`;
  assert.match(out, /Address these review findings/);
  assert.match(out, /FIX-THE-PARSER/, 'the blocking finding is in the re-run context');
});
