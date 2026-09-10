import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
import { pinReviewBase } from '../lib/review-inputs.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
const output = result => result.stdout + result.stderr;

function fixture(t, { git = false, fail = false, verdict = 'pass', mutation = '', invalidReview = false } = {}) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-run-finish-'))), root = join(parent, 'project');
  fs.mkdirSync(root); t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  const counter = kind => join(parent, kind);
  const bump = kind => `const p=${JSON.stringify(counter(kind))};fs.writeFileSync(p,String(Number(fs.existsSync(p)?fs.readFileSync(p):0)+1));`;
  fs.writeFileSync(join(root, 'check.cjs'), `const fs=require('fs');${bump('checks')}console.log('actual execution');process.exit(${fail ? 1 : 0});`);
  fs.writeFileSync(join(root, 'executor.cjs'), `const fs=require('fs');${bump('executors')}process.exit(1);`);
  fs.writeFileSync(join(root, 'review.cjs'), `const fs=require('fs');process.stdin.resume();process.stdin.on('end',()=>{${bump('reviews')}${mutation}console.log(${invalidReview ? "'invalid verdict'" : JSON.stringify(JSON.stringify({ verdict, findings: verdict === 'block' ? [{ severity: 'high', area: 'correctness', note: 'ordering is not tested' }] : [], decisions: [{ choice: 'Preserve ordering checks', rationale: 'Meaningful regression coverage', blastRadius: 'low', reversibility: 'easy' }] }))});});`);
  fs.writeFileSync(join(root, 'source.txt'), 'initial\n');
  fs.writeFileSync(join(root, 'locked.test.mjs'), '// visible locked fixture\n');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  meta.protocol.review = { command: 'node review.cjs', required: true };
  meta.protocol.executor = { command: 'node executor.cjs' }; store.saveMeta(meta);
  if (git) {
    const g = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    g('init', '-q', '-b', 'main'); g('config', 'user.name', 'Fixture'); g('config', 'user.email', 'fixture@example.test');
    g('add', '.'); g('commit', '-qm', 'baseline');
  }
  const task = { id: 'task-finish', title: 'chore: finish fixture', state: 'in-progress', startedAt: '2026-01-01T00:00:00.000Z', attempts: 7,
    acceptanceCriteria: [{ text: 'preserve ordering' }], tests: [store.lockTest(join(root, 'locked.test.mjs'))], reviews: [], after: [], reviewBase: pinReviewBase(root) };
  store.upsertTask(task);
  if (git) fs.writeFileSync(join(root, 'source.txt'), 'implemented\n');
  return { root, parent, store, task, count: kind => fs.existsSync(counter(kind)) ? Number(fs.readFileSync(counter(kind))) : 0,
    finish: (...args) => run(root, 'run', '--finish', task.id, ...args) };
}

test('finish runs verification once, skips executor and completes only the active target', t => {
  const f = fixture(t, { git: true });
  f.store.upsertTask({ ...f.task, id: 'task-other', state: 'specd' });
  const result = f.finish(); assert.equal(result.status, 0, output(result));
  assert.equal(f.count('checks'), 1); assert.equal(f.count('reviews'), 1); assert.equal(f.count('executors'), 0);
  const done = f.store.task(f.task.id);
  assert.equal(done.state, 'done'); assert.equal(done.startedAt, f.task.startedAt); assert.equal(done.attempts, 7);
  assert.equal(done.reviews.at(-1).verdict, 'pass'); assert.equal(done.reviews.at(-1).decisions.length, 1);
  assert.equal(f.store.task('task-other').state, 'specd');
  assert.match(output(result), /Execution directory:.*project/); assert.match(output(result), /Branch: "main"/);
  assert.ok(output(result).includes(f.task.reviewBase.commit));
  assert.match(output(result), /verification record:/); assert.match(output(result), /verify: \d+ ms/);
  assert.match(output(result), /review: \d+ ms/); assert.match(output(result), /completion: \d+ ms/);
  assert.match(output(result), /Decision: Preserve ordering checks/);
});

test('finish needs no executor configuration and ignores forged prior successful receipts', t => {
  const f = fixture(t), meta = f.store.meta(); delete meta.protocol.executor; f.store.saveMeta(meta);
  const dir = join(f.root, '.chalk/local/verification/forged'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, 'run.json'), JSON.stringify({ status: 'complete', green: true, toolchain: [{ gate: 'test', status: 'pass', exitCode: 0 }] }));
  const result = f.finish(); assert.equal(result.status, 0, output(result)); assert.equal(f.count('checks'), 1);
});

test('finish dry-run is read-only and displays target binding without any gate', t => {
  const f = fixture(t, { git: true }), before = fs.readFileSync(f.store.p.tasks, 'utf8');
  const result = f.finish('--dry-run'); assert.equal(result.status, 0, output(result));
  assert.equal(fs.readFileSync(f.store.p.tasks, 'utf8'), before);
  assert.equal(f.count('checks') + f.count('reviews') + f.count('executors'), 0);
  assert.match(output(result), /dry-run/); assert.match(output(result), /Branch: "main"/);
  assert.ok(output(result).includes(f.task.reviewBase.commit));
});

test('finish rejects missing, ambiguous, inactive and dependency-blocked targets before execution', t => {
  const f = fixture(t);
  for (const args of [['run', '--finish'], ['run', '--finish', 'missing'], ['run', '--force-rerun'], ['run', '--finish', f.task.id, '--max', '2'], ['run', '--finish', f.task.id, '--until', 'empty'], ['run', '--finish', f.task.id, '--dry-run', '--force-rerun']]) {
    const result = run(f.root, ...args); assert.notEqual(result.status, 0, output(result));
  }
  f.store.upsertTask({ ...f.task, id: 'task-finish-other' });
  assert.notEqual(run(f.root, 'run', '--finish', 'task-fin').status, 0);
  for (const state of ['specd', 'blocked', 'done']) {
    f.store.upsertTask({ ...f.task, state }); assert.notEqual(f.finish().status, 0);
  }
  f.store.upsertTask({ ...f.task, state: 'in-progress', after: ['missing-upstream'] });
  assert.notEqual(f.finish().status, 0); assert.equal(f.count('checks') + f.count('reviews'), 0);
});

test('force-rerun explicitly verifies again after the single review', t => {
  const f = fixture(t), result = f.finish('--force-rerun');
  assert.equal(result.status, 0, output(result)); assert.equal(f.count('checks'), 2); assert.equal(f.count('reviews'), 1);
  assert.match(output(result), /verify forced after review/);
});

for (const failure of ['verification', 'block', 'invalid-review']) test(`finish remains incomplete after ${failure}`, t => {
  const f = fixture(t, { fail: failure === 'verification', verdict: failure === 'block' ? 'block' : 'pass', invalidReview: failure === 'invalid-review' });
  const result = f.finish(); assert.notEqual(result.status, 0, output(result)); assert.equal(f.count('checks'), 1);
  assert.equal(f.count('reviews'), failure === 'verification' ? 0 : 1, 'no automatic review retry');
  assert.notEqual(f.store.task(f.task.id).state, 'done');
  if (failure === 'block') assert.match(output(result), /ordering is not tested/);
});

for (const [kind, mutation] of [
  ['source', "fs.writeFileSync('source.txt','changed during review');"],
  ['specification', "const p='.chalk/tasks.json',ts=JSON.parse(fs.readFileSync(p));ts[0].acceptanceCriteria=[{text:'changed contract'}];fs.writeFileSync(p,JSON.stringify(ts));"],
  ['configuration', "const p='.chalk/chalk.json',m=JSON.parse(fs.readFileSync(p));m.protocol.verify.test='node -e \\\"process.exit(0)\\\"';fs.writeFileSync(p,JSON.stringify(m));"],
  ['locked test', "fs.writeFileSync('locked.test.mjs','weakened');"],
]) test(`finish refuses ${kind} changes during review`, t => {
  const f = fixture(t, { mutation }), result = f.finish();
  assert.notEqual(result.status, 0, output(result)); assert.notEqual(f.store.task(f.task.id).state, 'done');
});

test('finish refuses untracked locked tests before spending time on verification', t => {
  const f = fixture(t, { git: true });
  execFileSync('git', ['rm', '--cached', 'locked.test.mjs'], { cwd: f.root });
  const result = f.finish(); assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), /not tracked/); assert.equal(f.count('checks'), 0);
});

for (const kind of ['output', 'receipt', 'missing receipt']) test(`finish rejects damaged ${kind} after verification`, t => {
  const mutation = `const dir='.chalk/local/verification';const p=dir+'/'+fs.readdirSync(dir)[0]+'/run.json';const r=JSON.parse(fs.readFileSync(p));` +
    (kind === 'output' ? "fs.writeFileSync(r.toolchain.find(c=>c.startedAt).stdoutPath,'forged output');" : kind === 'receipt' ? "r.green=true;r.toolchain=[];fs.writeFileSync(p,JSON.stringify(r));" : 'fs.unlinkSync(p);');
  const f = fixture(t, { mutation }), result = f.finish();
  assert.notEqual(result.status, 0, output(result)); assert.notEqual(f.store.task(f.task.id).state, 'done');
});

test('finish detects restored output writes during final admission', t => {
  const f = fixture(t), hook = join(f.parent, 'hook.mjs'), marker = join(f.parent, 'injected');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let armed=false,injected=false;const upsert=Store.prototype.upsertTask,locks=Store.prototype.brokenLocks;
Store.prototype.upsertTask=function(t){const r=upsert.call(this,t);if(t.reviews?.at(-1)?.by==='adversary')armed=true;return r;};
Store.prototype.brokenLocks=function(...args){const r=locks.apply(this,args);if(armed&&!injected){injected=true;const dir=this.root+'/.chalk/local/verification';const rec=JSON.parse(fs.readFileSync(dir+'/'+fs.readdirSync(dir)[0]+'/run.json'));const p=rec.toolchain.find(c=>c.startedAt).stdoutPath;const bytes=fs.readFileSync(p);fs.writeFileSync(p,'temporary forgery');fs.writeFileSync(p,bytes);fs.writeFileSync(${JSON.stringify(marker)},'injected');}return r;};
process.argv=${JSON.stringify([process.execPath, CLI, 'run', '--finish', f.task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', timeout: 60000 });
  assert.equal(fs.existsSync(marker), true, output(result)); assert.notEqual(result.status, 0, output(result));
  assert.notEqual(f.store.task(f.task.id).state, 'done');
  assert.match(output(result), /retained evidence changed/);
});

test('finish rechecks the latest review in its serialized completion transaction', t => {
  const f = fixture(t), hook = join(f.parent, 'review-race.mjs'), marker = join(f.parent, 'review-race');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let armed=false,injected=false;const upsert=Store.prototype.upsertTask,mutate=Store.prototype.mutateTasks;
Store.prototype.upsertTask=function(t){const r=upsert.call(this,t);if(t.reviews?.at(-1)?.by==='adversary')armed=true;return r;};
Store.prototype.mutateTasks=function(...args){if(armed&&!injected){injected=true;const ts=JSON.parse(fs.readFileSync(this.p.tasks));ts[0].reviews.push({verdict:'block',findings:[{note:'intervening finding'}]});fs.writeFileSync(this.p.tasks,JSON.stringify(ts));fs.writeFileSync(${JSON.stringify(marker)},'injected');}return mutate.apply(this,args);};
process.argv=${JSON.stringify([process.execPath, CLI, 'run', '--finish', f.task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', timeout: 60000 });
  assert.equal(fs.existsSync(marker), true, output(result)); assert.notEqual(result.status, 0, output(result));
  assert.equal(f.store.task(f.task.id).reviews.at(-1).verdict, 'block');
  assert.notEqual(f.store.task(f.task.id).state, 'done');
});

for (const gate of ['breakTest', 'mutation']) test(`finish blocks inconclusive configured ${gate} without accepting review`, t => {
  const f = fixture(t, { git: true }), meta = f.store.meta();
  meta.protocol[gate] = `chalk-nonexistent-adequacy-tool ${gate === 'breakTest' ? '{test}' : '{file}'}`; f.store.saveMeta(meta);
  const result = f.finish(); assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), /probe is inconclusive/); assert.equal(f.count('checks'), 1); assert.equal(f.count('reviews'), 0);
  assert.notEqual(f.store.task(f.task.id).state, 'done');
  assert.equal(fs.readFileSync(join(f.root, 'source.txt'), 'utf8'), 'implemented\n', 'break-it restores the implementation');
});

test('mutation cannot replace the original semantic contract without incrementing its revision', t => {
  const f = fixture(t, { git: true }), script = join(f.parent, 'mutate-contract.cjs');
  fs.writeFileSync(script, `const fs=require('fs');const p='.chalk/tasks.json';const ts=JSON.parse(fs.readFileSync(p));ts[0].acceptanceCriteria=[{text:'replacement contract'}];fs.writeFileSync(p,JSON.stringify(ts));`);
  const meta = f.store.meta(); meta.protocol.mutation = `node '${script}' {file}`; f.store.saveMeta(meta);
  const result = f.finish(); assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), /inputs changed during adequacy probes/);
  assert.equal(f.store.task(f.task.id).specRevision, f.task.specRevision, 'the exploit does not increment the revision');
  assert.equal(f.count('checks'), 1, 'do not verify a replacement contract'); assert.equal(f.count('reviews'), 0);
  assert.notEqual(f.store.task(f.task.id).state, 'done');
});

test('successful adequacy probes retain restoration verification and can finish', t => {
  const f = fixture(t, { git: true }), meta = f.store.meta();
  meta.protocol.breakTest = 'node -e "process.exit(1)"'; meta.protocol.mutation = 'node -e "process.exit(0)"'; f.store.saveMeta(meta);
  const result = f.finish(); assert.equal(result.status, 0, output(result));
  assert.equal(f.count('checks'), 2, 'verify again after restoration'); assert.equal(f.count('reviews'), 1);
  assert.equal(f.store.task(f.task.id).state, 'done');
});
