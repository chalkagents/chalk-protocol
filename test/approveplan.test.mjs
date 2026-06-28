// The plan-approval gate — planning is the human checkpoint. When protocol.plan.required is on, a
// human must approve the plan (after answering the scoping questions) before any code is written.
// Covers the predicate, `chalk approve-plan` (refusals + the open-questions guard + --force), the
// work refusal, and that an autonomous run blocks an unapproved plan instead of charging ahead.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planApprovalRequired } from '../lib/planning.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const tasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json')));
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f)); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };

test('planApprovalRequired — only when plan.required is set and the task is not approved', () => {
  const store = (required) => ({ protocol: () => ({ plan: { required } }) });
  assert.equal(planApprovalRequired(store(true), {}), true);
  assert.equal(planApprovalRequired(store(true), { planApproved: { at: 'x' } }), false);
  assert.equal(planApprovalRequired(store(false), {}), false, 'opt-in: off by default');
});

function project() {
  const d = mkdtempSync(join(tmpdir(), 'approveplan-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d, stdio: 'pipe' });
  chalk(d, 'init', '--name', 'd');
  return d;
}

test('chalk approve-plan — refuses without a plan, then with open questions, then approves', () => {
  const d = project();
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x');

  assert.notEqual(chalk(d, 'approve-plan', id).status, 0, 'no plan yet → refuse');

  // give the task a plan + an open scoping question
  const f = join(d, '.chalk/tasks.json'); const ts = tasks(d); ts[0].plan = 'do x'; writeFileSync(f, JSON.stringify(ts, null, 2));
  chalk(d, 'question', 'add', 'Which DB?', '--for', 'human');
  // tie the question to the task so the gate sees it
  const qf = join(d, '.chalk/questions.json'); const qs = JSON.parse(readFileSync(qf)); qs[0].taskId = ts[0].id; writeFileSync(qf, JSON.stringify(qs, null, 2));

  let r = chalk(d, 'approve-plan', id);
  assert.notEqual(r.status, 0, 'open questions → refuse');
  assert.match(`${r.stdout}${r.stderr}`, /question/i);

  // resolve the question, then approval succeeds
  const qid = JSON.parse(readFileSync(qf))[0].id;
  chalk(d, 'question', 'resolve', qid, 'postgres');
  r = chalk(d, 'approve-plan', id);
  assert.equal(r.status, 0, 'approves once questions are resolved');
  assert.ok(tasks(d)[0].planApproved?.at, 'planApproved recorded');
});

test('chalk approve-plan --force — approves despite open questions, logging a decision', () => {
  const d = project();
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x');
  const f = join(d, '.chalk/tasks.json'); const ts = tasks(d); ts[0].plan = 'do x'; writeFileSync(f, JSON.stringify(ts, null, 2));
  chalk(d, 'question', 'add', 'open?', '--for', 'human');
  const qf = join(d, '.chalk/questions.json'); const qs = JSON.parse(readFileSync(qf)); qs[0].taskId = ts[0].id; writeFileSync(qf, JSON.stringify(qs, null, 2));

  assert.equal(chalk(d, 'approve-plan', id, '--force', '--why', 'will resolve later').status, 0);
  assert.ok(tasks(d)[0].planApproved?.at);
});

test('chalk work — refuses an unapproved required plan, proceeds once approved', () => {
  const d = project();
  conf(d, (o) => { o.plan = { required: true }; o.executor = { command: 'node -e "0"' }; });
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x'); chalk(d, 'start', id);
  const ts = tasks(d); ts[0].plan = 'do x'; writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(ts, null, 2));

  const blocked = chalk(d, 'work', id);
  assert.notEqual(blocked.status, 0, 'work refuses without plan approval');
  assert.match(`${blocked.stdout}${blocked.stderr}`, /plan.*apprt?ov|approve-plan/i);

  chalk(d, 'approve-plan', id);
  // now work gets past the approval gate (it may still RED on verify, but not on approval)
  const after = chalk(d, 'work', id);
  assert.doesNotMatch(`${after.stdout}${after.stderr}`, /approve-plan/i, 'approval gate cleared');
});

test('chalk run — an unapproved required plan blocks (needs human-input), not the executor', () => {
  const d = project();
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync('RAN','1');`);
  conf(d, (o) => { o.plan = { required: true }; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });
  chalk(d, 'task', 'add', 'T'); const id = tasks(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'x');
  const ts = tasks(d); ts[0].plan = 'do x'; writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(ts, null, 2));

  chalk(d, 'run', '--max', '2');
  const t = tasks(d)[0];
  assert.equal(t.state, 'blocked', 'unapproved plan blocks the run');
  assert.equal(t.block.needs, 'human-input');
  assert.ok(t.handoff?.path, 'a handoff was written');
  assert.equal(spawnSync('test', ['-f', join(d, 'RAN')]).status, 1, 'the executor never ran');
});
