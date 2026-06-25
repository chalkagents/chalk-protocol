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
