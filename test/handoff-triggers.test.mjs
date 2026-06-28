// Handoff TRIGGERS — the three ways a task leaves a handoff for a fresh session: an explicit/auto
// `chalk block` (also the pipeline's auto-block path, which shells out to `chalk block`), the
// `chalk run` loop's auto-block, and churning past the attempt budget. Covers the attempt counter,
// the overAttemptBudget helper, and that the churn reason steers the operator to a fresh session.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overAttemptBudget } from '../lib/handoff.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const task0 = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const tid = (d) => task0(d).id.slice(0, 12);
function gitRepo() {
  const d = mkdtempSync(join(tmpdir(), 'handoff-trig-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# x\n'); g('add -A'); g('commit -m base');
  return d;
}

test('overAttemptBudget — true once attempts reach maxAttempts (default 3)', () => {
  const store = (max) => ({ protocol: () => ({ handoff: { maxAttempts: max } }) });
  assert.equal(overAttemptBudget(store(3), { attempts: 2 }), false);
  assert.equal(overAttemptBudget(store(3), { attempts: 3 }), true);
  assert.equal(overAttemptBudget(store(3), { attempts: 5 }), true);
  assert.equal(overAttemptBudget(store(3), {}), false, 'no attempts yet → under budget');
  assert.equal(overAttemptBudget({ protocol: () => ({}) }, { attempts: 3 }), true, 'default cap is 3');
});

test('chalk block — auto-writes a handoff (covers the pipeline auto-block, which shells out to block)', () => {
  const d = gitRepo();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'Wire the auth'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  const r = chalk(d, 'block', a, '--needs', 'decision', '--reason', 'need a product call on SSO');
  assert.equal(r.code, 0);
  assert.match(r.out, /handoff/, 'block reports the handoff');
  const t = task0(d);
  assert.equal(t.state, 'blocked');
  assert.ok(t.handoff, 'a handoff pointer is recorded on the task');
  assert.equal(t.handoff.reason, 'decision', 'the handoff reason is the block need');
  assert.ok(existsSync(join(d, t.handoff.path)), 'the handoff file exists');
  assert.match(readFileSync(join(d, t.handoff.path), 'utf8'), /need a product call on SSO/, 'the block reason is in the doc');
});

test('chalk work — each attempt increments task.attempts', () => {
  const d = gitRepo();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{}`); // does nothing
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(1)"'; o.executor = { command: 'node exec.mjs' }; });
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  assert.notEqual(chalk(d, 'work', a).code, 0, 'verify red → work fails');
  assert.equal(task0(d).attempts, 1, 'one work attempt recorded');
});

test('chalk run — the loop auto-blocks with a handoff, and escalates to a churn reason over budget', () => {
  const d = gitRepo();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{}`); // never makes verify pass
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(1)"'; o.executor = { command: 'node exec.mjs' }; o.handoff.maxAttempts = 1; });
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'run', '--max', '3');
  const t = task0(d);
  assert.equal(t.state, 'blocked', 'verify-red task auto-blocks in the loop');
  assert.equal(t.attempts, 1, 'the run-loop executor bumped attempts');
  assert.match(t.block.reason, /churn/, 'over budget → churn reason');
  assert.match(t.block.reason, /FRESH session/, 'the reason steers to a fresh session');
  assert.ok(t.handoff && existsSync(join(d, t.handoff.path)), 'the loop block left a handoff doc');
});
