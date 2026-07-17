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
import { runnableTasks, pendingDirectives } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];

const dir = (resolved = false) => ({ choice: 'process-global cache', instead: 'use an LRU with a size cap', at: 'x', by: 'human', resolved });

test('runnableTasks — a re-opened task (in-progress + unresolved directive) is runnable; a plain in-progress task is not', () => {
  const reopened = { id: 't1', state: 'in-progress', directives: [dir(false)] };
  const plainWip = { id: 't2', state: 'in-progress' };
  const reworked = { id: 't3', state: 'in-progress', directives: [dir(true)] };
  const specd = { id: 't4', state: 'specd' };
  const ids = runnableTasks([reopened, plainWip, reworked, specd]).map((t) => t.id);
  assert.ok(ids.includes('t1'), 'the re-opened task is picked up so the driver re-executes it');
  assert.ok(ids.includes('t4'), 'ordinary specd tasks still run');
  assert.ok(!ids.includes('t2'), 'a normal in-progress task is NOT re-picked (ordinary work unaffected)');
  assert.ok(!ids.includes('t3'), 'once its directive is resolved, a re-opened task is no longer runnable');
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
