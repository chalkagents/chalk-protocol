// The alignment gate (#191) — the director checkpoint. When protocol.director.required is on, a human
// must ACCEPT the acceptance criteria as the definition of *done* (via `chalk align`) before any code is
// built. This is the fix for #160: an autonomous run that builds everything and only then turns out
// misaligned. Covers the predicate, `chalk align` (refusal without criteria + records the acceptance),
// the `work` build refusal, and that an autonomous run BLOCKS an unaligned task instead of charging ahead.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criteriaAcceptedRequired } from '../lib/planning.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const tasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json')));
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f)); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };

test('criteriaAcceptedRequired — only when director.required is set and the task is not accepted', () => {
  const store = (required) => ({ protocol: () => ({ director: { required } }) });
  assert.equal(criteriaAcceptedRequired(store(true), {}), true);
  assert.equal(criteriaAcceptedRequired(store(true), { criteriaAccepted: { at: 'x' } }), false);
  assert.equal(criteriaAcceptedRequired(store(false), {}), false, 'opt-in: off by default');
  assert.equal(criteriaAcceptedRequired({ protocol: () => ({}) }, {}), false, 'no director config → off');
});

function project() {
  const d = mkdtempSync(join(tmpdir(), 'director-align-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d, stdio: 'pipe' });
  chalk(d, 'init', '--name', 'd');
  return d;
}

test('chalk align — refuses with no criteria, then records criteriaAccepted and echoes the criteria', () => {
  const d = project();
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);

  assert.notEqual(chalk(d, 'align', id).status, 0, 'no criteria yet → refuse');

  chalk(d, 'spec', id, '--criterion', 'the widget must foo');
  const r = chalk(d, 'align', id);
  assert.equal(r.status, 0, 'aligns once criteria exist');
  assert.match(`${r.stdout}${r.stderr}`, /the widget must foo/, 'surfaces the criteria to read');
  assert.ok(tasks(d)[0].criteriaAccepted?.at, 'criteriaAccepted recorded');
});

test('chalk align --by — attributes the acceptance', () => {
  const d = project();
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x');
  assert.equal(chalk(d, 'align', id, '--by', 'jerel').status, 0);
  assert.equal(tasks(d)[0].criteriaAccepted.by, 'jerel');
});

test('chalk work — refuses an unaligned required task, proceeds once aligned', () => {
  const d = project();
  conf(d, (o) => { o.director = { required: true }; o.executor = { command: 'node -e "0"' }; });
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x'); chalk(d, 'start', id);

  const stateBefore = tasks(d)[0].state;
  const blocked = chalk(d, 'work', id);
  assert.notEqual(blocked.status, 0, 'work refuses without alignment');
  assert.match(`${blocked.stdout}${blocked.stderr}`, /not accepted|align/i);
  // The gate is checked BEFORE the state flip: a refusal must leave no side effect (task not advanced).
  assert.equal(tasks(d)[0].state, stateBefore, 'refused work leaves the task state unchanged');
  assert.ok(!tasks(d)[0].criteriaAccepted, 'a refusal does not mark the criteria accepted');

  chalk(d, 'align', id);
  // now work gets past the alignment gate (it may still RED on verify, but not on alignment)
  const after = chalk(d, 'work', id);
  assert.doesNotMatch(`${after.stdout}${after.stderr}`, /criteria not accepted/i, 'alignment gate cleared');
});

test('chalk work — director off (default): no alignment required, gate is inert', () => {
  const d = project();
  conf(d, (o) => { o.executor = { command: 'node -e "0"' }; }); // director stays default (off)
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x'); chalk(d, 'start', id);
  const r = chalk(d, 'work', id);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /criteria not accepted/i, 'no gate when director is off');
});

test('chalk run — an unaligned required task BLOCKS (needs human-input), the executor never runs', () => {
  const d = project();
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync('RAN','1');`);
  conf(d, (o) => { o.director = { required: true }; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x');

  chalk(d, 'run', '--max', '2');
  const t = tasks(d)[0];
  assert.equal(t.state, 'blocked', 'unaligned task blocks the run');
  assert.equal(t.block.needs, 'human-input');
  assert.ok(t.handoff?.path, 'a handoff was written');
  assert.equal(spawnSync('test', ['-f', join(d, 'RAN')]).status, 1, 'the executor never ran');
});
