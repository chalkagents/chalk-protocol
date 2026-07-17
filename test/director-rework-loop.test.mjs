// A3 (#200) — close the loop: the driver re-runs a redirected task and the completion resolves the
// directive. A1 (#198) re-opens a redirected task; A2 (#199) feeds the correction into context; this
// makes the re-opened task RUNNABLE (so `chalk run`/`work` re-execute it), marks its directives
// RESOLVED on `chalk done`, and SURFACES pending rework in `chalk next` so it isn't stranded. Locked
// for task-86fadfe0.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnableTasks, pendingDirectives, resolveDirectives } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];

const dir = (resolved = false) => ({ choice: 'process-global cache', instead: 'use an LRU with a size cap', at: 'x', by: 'human', resolved });

test('runnableTasks — ONLY a re-opened task (reopenedAt + unresolved directive) is re-admitted', () => {
  const reopened = { id: 't1', state: 'in-progress', reopenedAt: 'x', directives: [dir(false)] };
  const activeRedirect = { id: 't2', state: 'in-progress', directives: [dir(false)] }; // redirected while ACTIVE, not re-opened
  const plainWip = { id: 't3', state: 'in-progress' };
  const reworked = { id: 't4', state: 'in-progress', reopenedAt: 'x', directives: [dir(true)] }; // rework already landed
  const specd = { id: 't5', state: 'specd' };
  const ids = runnableTasks([reopened, activeRedirect, plainWip, reworked, specd]).map((t) => t.id);
  assert.ok(ids.includes('t1'), 'a re-opened task awaiting rework is re-admitted so the driver re-executes it');
  assert.ok(ids.includes('t5'), 'ordinary specd tasks still run');
  assert.ok(!ids.includes('t2'), 'a directive on an ALREADY-active task does NOT re-admit it — no double-execution');
  assert.ok(!ids.includes('t3'), 'a plain in-progress task is untouched');
  assert.ok(!ids.includes('t4'), 'once reworked (directive resolved), it is no longer runnable — the loop terminates');
});

test('resolveDirectives — resolves pending corrections, clears the re-open marker, is idempotent', () => {
  const t = { reopenedAt: 'x', directives: [dir(false), dir(false), dir(true)] };
  assert.equal(resolveDirectives(t), 2, 'resolves the two pending; the already-resolved is not recounted');
  assert.ok(t.directives.every((d) => d.resolved), 'all resolved');
  assert.ok(t.directives[0].resolvedAt, 'stamped when');
  assert.equal(t.reopenedAt, undefined, 'the re-open marker is cleared so a stale marker can never re-admit the task later');
  assert.equal(resolveDirectives(t), 0, 'idempotent — nothing left to resolve');
});

test('rework terminates — a task reworked then redirected WHILE ACTIVE is not re-admitted (stale-marker invariant)', () => {
  // re-opened, reworked to done → resolveDirectives cleared reopenedAt
  const t = { id: 'z', state: 'in-progress', reopenedAt: 'x', directives: [dir(false)] };
  resolveDirectives(t);
  // now a fresh directive is added while the task is active again (NOT a done→reopen)
  t.directives.push(dir(false));
  assert.equal(runnableTasks([t]).length, 0, 'no reopenedAt ⇒ not re-admitted ⇒ no double-execution of in-flight work');
});

test('BOTH completion paths resolve directives — chalk done AND the pipeline merge call resolveDirectives', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs'), 'utf8');
  const calls = (src.match(/resolveDirectives\(t\)/g) || []).length;
  assert.ok(calls >= 2, `directive-resolution must fire on both completion paths (done + pipeline merge); found ${calls} call site(s) — reverting either trips this`);
});

function repo(task) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-rework-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [], ...task,
  }]));
  return d;
}

test('chalk done — resolves the task\'s pending director corrections (the loop closes)', () => {
  const d = repo({ state: 'in-progress', reopenedAt: 'x', directives: [dir(false)] });
  const r = chalk(d, 'done', 'task-9f3a2b1c');
  assert.equal(r.code, 0, `done succeeds: ${r.out}`);
  const t = taskOf(d);
  assert.equal(t.state, 'done');
  assert.equal(t.directives[0].resolved, true, 'completing the rework resolves the directive');
  assert.ok(t.directives[0].resolvedAt, 'and stamps when');
  assert.equal(t.reopenedAt, undefined, 'the re-open marker is cleared on completion');
  assert.match(r.out, /correction\(s\) resolved/i, 'the resolution is reported');
  assert.equal(pendingDirectives(t).length, 0, 'nothing left pending');
});

test('chalk next — surfaces a re-opened task and its pending rework (not stranded as plain in-progress)', () => {
  const d = repo({ state: 'in-progress', reopenedAt: 'x', directives: [dir(false)] });
  const out = chalk(d, 'next').out;
  assert.match(out, /re-opened for rework/i, 'the re-open is called out');
  assert.match(out, /pending rework/i, 'the pending correction is surfaced');
  assert.match(out, /use an LRU with a size cap/, 'with the specific instruction to rebuild to');
});
