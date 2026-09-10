import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
import { captureVerificationProvenance, verificationReuseInputs } from '../lib/verification-reuse.mjs';

const CLI = resolve('bin/chalk.mjs');
const output = result => result.stdout + result.stderr;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (cwd, args, env = {}) => spawnSync(process.execPath, [CLI, ...args], {
  cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...env },
});
const ok = (cwd, args, env) => { const result = run(cwd, args, env); assert.equal(result.status, 0, output(result)); return result; };

function fixture(t, { command } = {}) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-verification-reuse-'))), root = join(parent, 'project');
  fs.mkdirSync(root); t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  ok(root, ['init', '--bare']);
  const countPath = join(parent, 'checks'), failurePath = join(parent, 'fail');
  fs.writeFileSync(join(root, 'check.cjs'), `const fs=require('fs'),p=${JSON.stringify(countPath)};fs.writeFileSync(p,String(Number(fs.existsSync(p)?fs.readFileSync(p):0)+1));console.log('checked');process.exit(fs.existsSync(${JSON.stringify(failurePath)})?1:0);\n`);
  fs.writeFileSync(join(root, 'source.txt'), 'initial\n');
  fs.writeFileSync(join(root, 'locked.test.mjs'), '// locked\n');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: command || 'node check.cjs' };
  meta.protocol.requireTest = false; meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-reuse', title: 'feat: reuse fixture', state: 'in-progress', acceptanceCriteria: [{ text: 'reuse safely' }],
    tests: [store.lockTest(join(root, 'locked.test.mjs'))], reviews: [], after: [] };
  store.upsertTask(task);
  return { parent, root, store, task, failurePath, count: () => fs.existsSync(countPath) ? Number(fs.readFileSync(countPath)) : 0,
    verify: env => ok(root, ['verify'], env), review: env => ok(root, ['review', task.id, '--note', 'reviewed'], env),
    done: (args = [], env) => run(root, ['done', task.id, ...args], env) };
}

test('reuse identity is explicit and unknown command/dependency coverage disables it', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-reuse-identity-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(join(root, 'check.cjs'), 'process.exit(0);\n');
  const known = captureVerificationProvenance({ verify: { test: 'node check.cjs' }, runner: '', e2e: {} }, 'task', process.env, root);
  assert.equal(known.status, 'known'); assert.equal(known.commands[0].executable.inputs[join(root, 'check.cjs')].length, 64);
  const unknown = captureVerificationProvenance({ verify: { test: 'node check.cjs && node check.cjs' }, runner: '', e2e: {} }, 'task', process.env, root);
  assert.equal(unknown.status, 'unknown');
  const inputs = { source: { status: 'known', method: 'filesystem', files: {} }, integrityDigest: 'a', configDigest: 'b', tasksDigest: 'c',
    tasks: [{ id: 'task', dependencies: [{ ref: 'missing', status: 'missing', matches: [] }] }] };
  assert.equal(verificationReuseInputs(inputs, known).status, 'unknown');
});

test('a later failed attempt supersedes an older reusable green', t => {
  const f = fixture(t); f.verify(); f.review(); fs.writeFileSync(f.failurePath, 'fail');
  const failed = run(f.root, ['verify']); assert.equal(failed.status, 2, output(failed)); fs.unlinkSync(f.failurePath);
  const done = f.done(); assert.equal(done.status, 0, output(done)); assert.equal(f.count(), 3);
  assert.match(output(done), /reuse unavailable.*running checks/s);
});

test('unchanged verify-review-done reuses one validated execution and force-rerun bypasses it', t => {
  const reused = fixture(t); reused.verify(); reused.review(); ok(reused.root, ['update', 'bookkeeping only']);
  const done = reused.done(); assert.equal(done.status, 0, output(done)); assert.match(output(done), /reusing validated verification record/);
  assert.equal(reused.count(), 1); assert.equal(reused.store.task(reused.task.id).state, 'done');

  const forced = fixture(t); forced.verify(); forced.review();
  const rerun = forced.done(['--force-rerun']); assert.equal(rerun.status, 0, output(rerun));
  assert.doesNotMatch(output(rerun), /reusing validated/); assert.equal(forced.count(), 2);
});

for (const kind of ['source', 'configuration', 'environment', 'dependency', 'toolchain']) test(`${kind} identity changes force fresh verification`, t => {
  let tool;
  if (kind === 'toolchain') {
    const outside = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-reuse-tool-'))); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    tool = join(outside, 'check-tool');
    fs.writeFileSync(tool, `#!/bin/sh\nexec node "$1"\n`, { mode: 0o700 });
  }
  const f = fixture(t, { command: tool ? `${tool} check.cjs` : undefined });
  if (kind === 'dependency') {
    f.store.upsertTask({ id: 'task-upstream', title: 'upstream', state: 'done', acceptanceCriteria: [], tests: [], reviews: [], completedSpecRevision: 0 });
    f.store.upsertTask({ ...f.store.task(f.task.id), after: ['task-upstream'] });
  }
  f.verify(kind === 'environment' ? { CHALK_REUSE_TEST_ENV: 'before' } : undefined);
  if (kind === 'source') fs.writeFileSync(join(f.root, 'source.txt'), 'changed\n');
  if (kind === 'configuration') { const meta = f.store.meta(); meta.protocol.verify.test = 'node check.cjs changed-argument'; f.store.saveMeta(meta); }
  if (kind === 'dependency') f.store.upsertTask({ ...f.store.task('task-upstream'), specRevision: 1, completedSpecRevision: 1 });
  if (kind === 'toolchain') fs.writeFileSync(tool, `#!/bin/sh\n# changed tool bytes\nexec node "$1"\n`, { mode: 0o700 });
  const env = kind === 'environment' ? { CHALK_REUSE_TEST_ENV: 'after' } : undefined;
  f.review(env); const done = f.done([], env);
  assert.equal(done.status, 0, output(done)); assert.match(output(done), /reuse unavailable.*running checks/s);
  assert.equal(f.count(), 2); assert.equal(f.store.task(f.task.id).state, 'done');
});

for (const damage of ['stream', 'matching-hash receipt']) test(`damaged ${damage} is rejected and replaced by fresh execution`, t => {
  const f = fixture(t); f.verify(); f.review();
  const referencePath = join(f.root, '.chalk/local/verification-references', fs.readdirSync(join(f.root, '.chalk/local/verification-references'))[0]);
  const reference = JSON.parse(fs.readFileSync(referencePath));
  const receiptPath = join(f.root, '.chalk/local/verification', reference.receiptId, 'run.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath));
  if (damage === 'stream') fs.writeFileSync(receipt.toolchain.find(command => command.startedAt).stdoutPath, 'forged output');
  else {
    delete receipt.provenance;
    const bytes = JSON.stringify(receipt, null, 2) + '\n'; fs.writeFileSync(receiptPath, bytes);
    reference.receiptDigest = sha256(bytes); fs.writeFileSync(referencePath, JSON.stringify(reference, null, 2) + '\n');
  }
  const done = f.done(); assert.equal(done.status, 0, output(done)); assert.equal(f.count(), 2);
  assert.match(output(done), /reuse unavailable.*running checks/s);
});

test('reuse admission observes a temporary source rewrite and keeps the task incomplete', t => {
  const f = fixture(t); f.verify(); f.review();
  const hook = join(f.parent, 'admission-race.mjs'), marker = join(f.parent, 'injected');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let injected=false;const locks=Store.prototype.brokenLocks;Store.prototype.brokenLocks=function(...args){const result=locks.apply(this,args);if(!injected){injected=true;const p=this.root+'/source.txt',bytes=fs.readFileSync(p);fs.writeFileSync(p,'temporary');fs.writeFileSync(p,bytes);fs.writeFileSync(${JSON.stringify(marker)},'yes');}return result;};
process.argv=${JSON.stringify([process.execPath, CLI, 'done', f.task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(fs.existsSync(marker), true, output(result)); assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), /changed during verification|input observation failed/); assert.equal(f.count(), 1);
  assert.equal(f.store.task(f.task.id).state, 'in-progress');
});
