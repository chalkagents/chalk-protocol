// End-to-end tests for the Chalk Protocol CLI. Drives the real `bin/chalk.mjs` against
// throwaway projects and asserts the GATES behave. Zero deps — `node --test`.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');

// run a chalk command in `cwd`; return {code, out}
function chalk(cwd, ...args) {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-test-'));
// fn receives the `protocol` object (verify/review/regression live there now).
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tid = (d, i = 0) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[i].id.slice(0, 12);
const TEST = (body) => `import {sum} from './sum.mjs'; import a from 'node:assert'; ${body} console.log('ok');`;

test('version — prints the protocol version', () => {
  const d = scratch();
  const r = chalk(d, 'version');
  assert.equal(r.code, 0, 'version exits 0');
  assert.ok(r.out.includes('chalk/0'), 'version output contains the protocol constant');
});

test('init scaffolds the spine + installs the agent contract', () => {
  const d = scratch();
  assert.equal(chalk(d, 'init', '--name', 'demo', '--goal', 'g').code, 0);
  assert.ok(existsSync(join(d, '.chalk/chalk.json')));
  assert.ok(existsSync(join(d, '.chalk/held-out')));
  assert.ok(readFileSync(join(d, 'AGENTS.md'), 'utf8').includes('Chalk Protocol'));
  assert.ok(readFileSync(join(d, 'CLAUDE.md'), 'utf8').includes('READ-ONLY'));
});

test('P1 — start refuses without acceptance criteria, allows after spec', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'implement sum');
  const id = tid(d);
  assert.equal(chalk(d, 'start', id).code, 1, 'start must be blocked with no criteria');
  chalk(d, 'spec', id, '--criterion', 'adds two numbers');
  assert.equal(chalk(d, 'start', id).code, 0, 'start allowed once criteria exist');
});

test('log --json — emits one valid JSON event per line; plain log unchanged', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'update', 'first thing happened');
  chalk(d, 'update', 'second thing happened');
  const json = chalk(d, 'log', '--json');
  assert.equal(json.code, 0);
  const lines = json.out.split('\n').filter(Boolean);
  assert.ok(lines.length >= 2, 'one line per event');
  const events = lines.map((l) => JSON.parse(l)); // throws if any line is not valid JSON
  for (const e of events) assert.ok(typeof e.type === 'string' && typeof e.title === 'string', 'event carries type + title');
  assert.ok(events.some((e) => e.title === 'second thing happened'), 'titles round-trip through JSON');
  // --n still limits the JSON output.
  assert.equal(chalk(d, 'log', '--json', '--n', '1').out.split('\n').filter(Boolean).length, 1, '--n limits json lines');
  // Without --json the human format is unchanged: bracketed type, no raw JSON braces.
  const plain = chalk(d, 'log');
  assert.ok(plain.out.includes('[progress-update]') && !plain.out.includes('"type"'), 'plain log stays human-readable');
});

test('P4 + P6 — done needs green verify; tampering a locked test fails integrity', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'sum.test.mjs'), TEST('a.equal(sum(2,3),5);'));
  conf(d, (o) => { o.verify.test = 'node sum.test.mjs'; });
  chalk(d, 'task', 'add', 'impl');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'adds', '--test', 'sum.test.mjs');
  chalk(d, 'start', id);
  assert.equal(chalk(d, 'done', id).code, 1, 'done blocked while verify is red (no impl yet)');
  writeFileSync(join(d, 'sum.mjs'), 'export const sum=(a,b)=>a+b;');
  assert.equal(chalk(d, 'verify').code, 0, 'verify green once impl exists');
  appendFileSync(join(d, 'sum.test.mjs'), '\n// tampered');
  assert.equal(chalk(d, 'verify').code, 2, 'verify red on integrity even though the test still passes');
  assert.equal(chalk(d, 'amend-spec', id, '--test', 'sum.test.mjs', '--why', 'broaden').code, 0);
  assert.equal(chalk(d, 'verify').code, 0, 'green again after re-lock');
  assert.equal(chalk(d, 'done', id).code, 0, 'done succeeds on green + intact');
});

test('P5 — adversarial review blocks green-but-wrong, passes after fix', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'sum.test.mjs'), TEST('a.equal(sum(2,3),5);')); // weak: happy path only
  writeFileSync(join(d, 'reviewer.mjs'),
    `import {readFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{}
     const c=(()=>{try{return readFileSync('./sum.mjs','utf8')}catch{return''}})();
     const guarded=/typeof|isFinite|isNaN/.test(c);
     console.log(JSON.stringify(guarded?{verdict:'pass',findings:[]}:{verdict:'block',findings:[{severity:'high',area:'correctness',note:'no guard'}]}));`);
  conf(d, (o) => { o.verify.test = 'node sum.test.mjs'; o.review = { command: 'node reviewer.mjs', required: true }; });
  chalk(d, 'task', 'add', 'reject non-numbers');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'throws on non-number', '--test', 'sum.test.mjs');
  chalk(d, 'start', id);
  writeFileSync(join(d, 'sum.mjs'), 'export const sum=(a,b)=>a+b;'); // passes weak test, wrong vs criterion
  assert.equal(chalk(d, 'verify').code, 0, 'verify is green (weak test)');
  assert.equal(chalk(d, 'done', id).code, 1, 'done blocked: review required, not run');
  assert.equal(chalk(d, 'review', id).code, 3, 'review BLOCKS the inadequate change');
  assert.equal(chalk(d, 'done', id).code, 1, 'still blocked after a blocking review');
  writeFileSync(join(d, 'sum.mjs'), "export const sum=(a,b)=>{if(typeof a!=='number'||typeof b!=='number')throw new TypeError('x');return a+b;};");
  assert.equal(chalk(d, 'review', id).code, 0, 'review passes once criterion met');
  assert.equal(chalk(d, 'done', id).code, 0, 'done succeeds');
});

test('P7 — held-out catches the spec gap; phase gated on a green, fresh audit', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, '.chalk/held-out/r.mjs'),
    "import {f} from '../../f.mjs'; import a from 'node:assert'; a.equal(f('A B'),'a-b'); console.log('ok');");
  conf(d, (o) => { o.regression.command = 'node .chalk/held-out/r.mjs'; o.regression.required = true; });
  chalk(d, 'guard', 'add', '.chalk/held-out/r.mjs');
  writeFileSync(join(d, 'f.mjs'), 'export const f=(s)=>s.toLowerCase();'); // misses space→dash
  assert.equal(chalk(d, 'audit').code, 2, 'held-out fails on the wrong impl');
  assert.equal(chalk(d, 'phase', 'build').code, 1, 'phase blocked while audit is red');
  writeFileSync(join(d, 'f.mjs'), 'export const f=(s)=>s.toLowerCase().replace(/ /g,"-");');
  assert.equal(chalk(d, 'audit').code, 0, 'held-out green once spec is met');
  assert.equal(chalk(d, 'phase', 'build').code, 0, 'phase advances on green audit');
  appendFileSync(join(d, '.chalk/held-out/r.mjs'), '\n// tampered');
  assert.equal(chalk(d, 'audit').code, 2, 'held-out integrity violation fails the audit');
});

test('blocked — next skips a blocked task; status shows the need; unblock restores it', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'needs creds'); const a = tid(d, 0);
  chalk(d, 'task', 'add', 'runnable');    const b = tid(d, 1);
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'spec', b, '--criterion', 'y');
  chalk(d, 'start', a);
  assert.equal(chalk(d, 'block', a, '--needs', 'bogus', '--reason', 'r').code, 1, 'rejects unknown --needs');
  assert.equal(chalk(d, 'block', a, '--needs', 'creds', '--reason', 'firebase').code, 0);
  const n = chalk(d, 'next').out;
  assert.ok(n.includes('runnable') || n.includes(b), 'next points to the runnable task');
  assert.ok(/blocked/i.test(chalk(d, 'status').out), 'status surfaces the blocked task');
  assert.equal(chalk(d, 'unblock', a).code, 0);
  assert.ok(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))
              .find((t) => t.id.startsWith(a)).state === 'in-progress', 'unblock restores prior state');
});

test('backlog/DAG — next honors --after deps; backlog groups by milestone', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(0)"'; });
  chalk(d, 'task', 'add', 'A first', '--milestone', 'core');
  const a = tid(d, 0);
  chalk(d, 'task', 'add', 'B after A', '--milestone', 'core', '--after', a);
  const b = tid(d, 1);
  assert.equal(chalk(d, 'task', 'add', 'bad dep', '--after', 'task-nope').code, 1, '--after rejects an unknown task');
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'spec', b, '--criterion', 'y');
  // B waits on A: next should offer A (startable) and show B waiting.
  let n = chalk(d, 'next').out;
  assert.ok(n.includes('A first'), 'next offers the dependency-free task A');
  assert.ok(/waiting/i.test(n) && n.includes('B after A'), 'next shows B waiting on its dep');
  // Finish A; now B becomes runnable.
  chalk(d, 'start', a); chalk(d, 'done', a);
  n = chalk(d, 'next').out;
  assert.ok(n.includes('B after A'), 'next offers B once A is done');
  // backlog groups under the milestone and shows the edge.
  const bl = chalk(d, 'backlog').out;
  assert.ok(bl.includes('core') && /after A first/.test(bl), 'backlog groups by milestone and shows the dep edge');
});

test('presets + runner — init fills verify; runner prefixes gate commands; auto-detect', () => {
  const readProto = (d) => JSON.parse(readFileSync(join(d, '.chalk/chalk.json'), 'utf8')).protocol;
  // Explicit preset fills verify defaults.
  const d1 = scratch();
  assert.equal(chalk(d1, 'init', '--name', 'd', '--preset', 'node').code, 0);
  assert.equal(readProto(d1).verify.test, 'node --test', 'node preset sets the test gate');
  // Auto-detect from a marker file (bare --preset).
  const d2 = scratch();
  writeFileSync(join(d2, 'package.json'), '{}');
  chalk(d2, 'init', '--name', 'd', '--preset');
  assert.equal(readProto(d2).verify.test, 'node --test', 'bare --preset auto-detects node from package.json');
  // Runner prefixes the gate command at verify time. Use a runner that turns the command into a pass.
  const d3 = scratch();
  chalk(d3, 'init', '--name', 'd', '--runner', 'node');
  writeFileSync(join(d3, 'ok.mjs'), "process.exit(0);");
  conf(d3, (o) => { o.verify.test = 'ok.mjs'; }); // becomes `node ok.mjs` once prefixed
  assert.equal(chalk(d3, 'verify').code, 0, 'runner prefix makes `ok.mjs` run as `node ok.mjs`');
  // No preset → empty defaults preserved (back-compat).
  const d4 = scratch();
  chalk(d4, 'init', '--name', 'd');
  assert.equal(readProto(d4).verify.test, '', 'no preset leaves verify empty');
});

test('when:phase — verify defers the slow gate; audit runs it and gates phase advance', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  // A passing task gate + a FAILING phase-scheduled gate (e.g. a slow build).
  conf(d, (o) => {
    o.verify.test = 'node -e "process.exit(0)"';
    o.verify.build = { cmd: 'node -e "process.exit(1)"', when: 'phase' };
    o.regression.required = true; // so `phase` is gated on a fresh green audit
  });
  // Task-mode verify is GREEN: the phase gate is deferred, not run.
  const v = chalk(d, 'verify');
  assert.equal(v.code, 0, 'verify green — phase gate deferred');
  assert.ok(/defer/i.test(v.out), 'verify marks the phase gate deferred');
  // Audit runs the phase gate → RED, and phase advance is blocked.
  assert.equal(chalk(d, 'audit').code, 2, 'audit runs the failing phase build → red');
  assert.equal(chalk(d, 'phase', 'build').code, 1, 'phase blocked while audit is red');
  // Fix the build → audit green → phase advances.
  conf(d, (o) => { o.verify.build = { cmd: 'node -e "process.exit(0)"', when: 'phase' }; });
  assert.equal(chalk(d, 'audit').code, 0, 'audit green once the phase build passes');
  assert.equal(chalk(d, 'phase', 'build').code, 0, 'phase advances on a green audit');
});

const PASS_REVIEWER = `import {readFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{} console.log(JSON.stringify({verdict:'pass',findings:[]}));`;

test('review cadence — milestone-boundary gates only the task that closes the milestone', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'rev.mjs'), PASS_REVIEWER);
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(0)"'; o.review = { command: 'node rev.mjs', requiredAt: ['milestone-boundary'] }; });
  chalk(d, 'task', 'add', 'core A', '--milestone', 'core'); const a = tid(d, 0);
  chalk(d, 'task', 'add', 'core B', '--milestone', 'core'); const b = tid(d, 1);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'spec', b, '--criterion', 'y');
  chalk(d, 'start', a);
  assert.equal(chalk(d, 'done', a).code, 0, 'non-last task in the milestone: done needs no review');
  chalk(d, 'start', b);
  assert.equal(chalk(d, 'done', b).code, 1, 'last task in the milestone: done blocked until reviewed');
  assert.equal(chalk(d, 'review', b).code, 0, 'review passes');
  assert.equal(chalk(d, 'done', b).code, 0, 'done succeeds after the milestone review');
});

test('review cadence — phase-advance gates the seam, not per-task done; absent-cadence degrades', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'rev.mjs'), PASS_REVIEWER);
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(0)"'; o.review = { command: 'node rev.mjs', requiredAt: ['phase-advance'] }; });
  chalk(d, 'task', 'add', 'T'); const a = tid(d, 0);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  assert.equal(chalk(d, 'done', a).code, 0, 'per-task done needs no review under phase-advance');
  assert.equal(chalk(d, 'phase', 'build').code, 1, 'phase blocked while a worked task is unreviewed');
  assert.equal(chalk(d, 'review', a).code, 0, 'review the task');
  // A task parked on a human dependency must NOT wedge the phase-advance review gate.
  chalk(d, 'task', 'add', 'needs creds'); const b = tid(d, 1);
  chalk(d, 'spec', b, '--criterion', 'z'); chalk(d, 'start', b);
  chalk(d, 'block', b, '--needs', 'creds', '--reason', 'firebase');
  assert.equal(chalk(d, 'phase', 'build').code, 0, 'blocked task does not gate phase-advance; advances once worked tasks reviewed');
});

test('run — drives runnable tasks to done in dependency order; --dry-run is side-effect-free', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  // executor reads the context (ignored) and writes the impl that makes verify pass.
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync,writeFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{} writeFileSync('impl.txt','ok');`);
  writeFileSync(join(d, 'check.mjs'), `import {existsSync} from 'node:fs'; process.exit(existsSync('impl.txt')?0:1);`);
  conf(d, (o) => { o.verify.test = 'node check.mjs'; o.executor = { command: 'node exec.mjs' }; });
  chalk(d, 'task', 'add', 'A first'); const a = tid(d, 0);
  chalk(d, 'task', 'add', 'B after A', '--after', a); const b = tid(d, 1);
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'spec', b, '--criterion', 'y');
  // dry-run lists only the dependency-free task and changes nothing.
  const tasksPath = join(d, '.chalk/tasks.json');
  const before = readFileSync(tasksPath, 'utf8');
  const dry = chalk(d, 'run', '--dry-run');
  assert.ok(/dry-run/i.test(dry.out) && dry.out.includes('A first'), 'dry-run prints the planned order');
  assert.equal(readFileSync(tasksPath, 'utf8'), before, 'dry-run is side-effect-free');
  // real run drives both to done.
  assert.equal(chalk(d, 'run', '--max', '5').code, 0);
  const tasks = JSON.parse(readFileSync(tasksPath, 'utf8'));
  assert.ok(tasks.every((t) => t.state === 'done'), 'run drove every task to done');
});

test('run — auto-blocks a task the executor cannot make green; degrades without an executor', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0,'utf8')}catch{}`); // does nothing
  conf(d, (o) => { o.verify.test = 'node -e "process.exit(1)"'; o.executor = { command: 'node exec.mjs' }; });
  chalk(d, 'task', 'add', 'T'); const a = tid(d, 0);
  chalk(d, 'spec', a, '--criterion', 'x');
  chalk(d, 'run', '--max', '3');
  const t = () => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal(t().state, 'blocked', 'task auto-blocked when verify stays red after the executor');
  assert.equal(t().block.needs, 'human-input', 'blocked with needs: human-input');
  // No executor → run degrades to the manual loop and exits 0.
  conf(d, (o) => { o.executor = { command: '' }; });
  chalk(d, 'unblock', a);
  const r = chalk(d, 'run');
  assert.equal(r.code, 0, 'no executor → run exits 0');
  assert.ok(/no executor|manual loop/i.test(r.out), 'run prints the manual fallback');
});
