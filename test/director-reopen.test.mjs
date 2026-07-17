// A1 (#198) — redirect actually re-directs. Before this, `chalk pending redirect` (#193) only logged a
// course-correction and dropped the item from the inbox; the task stayed done and the agent never
// rebuilt. This makes the correction ACTIONABLE: a durable directive on the task, and a done task
// RE-OPENS for rework. The executor's next run reads the directive (#199) and re-runs to resolve it
// (#200) — this is the step that makes redirect *redirect*. Locked for task-3a49d957.
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

// One task in `state`, carrying a high-risk review decision to redirect.
function repo(state) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-reopen-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', state,
    acceptanceCriteria: [{ text: 'works' }], tests: [],
    reviews: [{ verdict: 'pass', findings: [], decisions: [
      { choice: 'chose a process-global cache', rationale: 'simplest', blastRadius: 'high', reversibility: 'hard' },
    ] }],
  }]));
  return d;
}

test('redirect records a durable, unresolved directive on the task', () => {
  const d = repo('done');
  assert.equal(chalk(d, 'pending', 'redirect', 'task-9f3a2b1c#0', 'use an LRU with a size cap').code, 0);
  const t = taskOf(d);
  assert.equal((t.directives || []).length, 1, 'a directive is attached to the task');
  const dir = t.directives[0];
  assert.equal(dir.choice, 'chose a process-global cache', 'the directive names the choice it corrects');
  assert.equal(dir.instead, 'use an LRU with a size cap', 'the directive carries what to do instead');
  assert.equal(dir.resolved, false, 'it starts unresolved — the rework has not happened yet');
  assert.ok(dir.at && dir.by, 'provenance recorded');
});

test('redirecting a DONE task re-opens it for rework (→ in-progress)', () => {
  const d = repo('done');
  chalk(d, 'pending', 'redirect', 'task-9f3a2b1c#0', 'do it differently');
  const t = taskOf(d);
  assert.equal(t.state, 'in-progress', 'a done task is re-opened so it can be reworked');
  assert.ok(t.reopenedAt, 'the re-open is stamped');
});

test('redirecting a non-done task keeps its state — only attaches the directive', () => {
  const d = repo('in-progress');
  chalk(d, 'pending', 'redirect', 'task-9f3a2b1c#0', 'adjust the approach');
  const t = taskOf(d);
  assert.equal(t.state, 'in-progress', 'an already-active task is not state-flipped');
  assert.equal(t.reopenedAt, undefined, 're-open is only for tasks that were done');
  assert.equal((t.directives || []).length, 1, 'the directive still attaches');
});

test('accept does NOT create a directive or re-open (only redirect re-directs)', () => {
  const d = repo('done');
  chalk(d, 'pending', 'accept', 'task-9f3a2b1c#0');
  const t = taskOf(d);
  assert.equal((t.directives || []).length, 0, 'accepting a call needs no rework');
  assert.equal(t.state, 'done', 'an accepted task stays done');
});
