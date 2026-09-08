import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify, runToolchain } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

const CLI = resolve('bin/chalk.mjs');
function project(t, script = 'console.log("verified")') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-record-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--name', 'record'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), script);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  store.saveMeta(meta);
  store.upsertTask({ id: 'task-record', title: 'record', state: 'in-progress', acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [] });
  return { root, store };
}
const record = (v) => JSON.parse(readFileSync(v.evidence.path, 'utf8'));

test('verify persists successful full streams, inputs, task contract and distinct runs', t => {
  const { root, store } = project(t, 'process.stdout.write("x".repeat(2*1024*1024)); process.stderr.write("warning");');
  const v = verify(store), r = record(v), g = r.toolchain.find(g => g.gate === 'test');
  assert.equal(v.green, true);
  assert.equal(r.status, 'complete');
  assert.equal(r.cwd, root);
  assert.equal(r.before.source.digest, r.after.source.digest);
  assert.ok(r.before.source.files['check.cjs']);
  assert.equal(r.before.tasks[0].id, 'task-record');
  assert.equal(r.before.tasks[0].acceptanceCriteria[0].text, 'works');
  assert.equal(r.before.config.verify.test, 'node check.cjs');
  assert.ok(r.startedAt && r.finishedAt && g.startedAt && g.finishedAt);
  assert.equal(g.exitCode, 0);
  assert.equal(readFileSync(g.stdoutPath).length, 2*1024*1024);
  assert.equal(readFileSync(g.stderrPath, 'utf8'), 'warning');
  assert.notEqual(verify(store).evidence.id, v.evidence.id);
});

test('failed commands preserve exit status and both streams', t => {
  const { store } = project(t, 'console.log("before failure"); console.error("bad"); process.exit(7);');
  const v = verify(store), g = record(v).toolchain.find(g => g.gate === 'test');
  assert.equal(v.green, false);
  assert.equal(g.exitCode, 7);
  assert.match(readFileSync(g.stdoutPath, 'utf8'), /before failure/);
  assert.match(readFileSync(g.stderrPath, 'utf8'), /bad/);
});

test('timeouts and interrupted commands retain evidence and cannot pass', t => {
  const { root } = project(t, 'process.stdout.write("started\\n",()=>require("fs").writeFileSync(".chalk/local/timeout-ready","ready")); setInterval(()=>{},1000);');
  let ready = false;
  // Confirm emission through an independent startup marker before asserting retention. Retry
  // only a startup-starved run, never a run that emitted output and then lost its log.
  for (const timeoutMs of [2000, 8000, 30000]) {
    const gate = runToolchain(root, { test: 'node check.cjs' }, { timeoutMs }).find(g => g.gate === 'test');
    assert.equal(gate.status, 'fail'); assert.equal(gate.errorCode, 'ETIMEDOUT'); assert.ok(gate.signal);
    ready = existsSync(join(root, '.chalk/local/timeout-ready'));
    if (ready) { assert.match(readFileSync(gate.stdoutPath, 'utf8'), /started/); break; }
  }
  assert.ok(ready, 'the subprocess must have emitted output before testing timeout retention');
  writeFileSync(join(root, 'check.cjs'), 'console.log("interrupt"); process.kill(process.pid,"SIGTERM");');
  const interrupted = runToolchain(root, { test: 'node check.cjs' }).find(g => g.gate === 'test');
  assert.equal(interrupted.status, 'fail');
  assert.match(readFileSync(interrupted.stdoutPath, 'utf8'), /interrupt/);
});

test('same-size source mutation during verify makes the run stale and red', t => {
  const { root, store } = project(t, 'require("fs").writeFileSync("source.js","bbbb");');
  writeFileSync(join(root, 'source.js'), 'aaaa');
  const v = verify(store), r = record(v);
  assert.equal(v.toolchainGreen, true);
  assert.equal(v.green, false);
  assert.equal(r.freshness, 'stale');
  assert.notEqual(r.before.source.digest, r.after.source.digest);
});

test('git manifest includes tracked and untracked inputs, excludes generated and protocol state', t => {
  const { root, store } = project(t);
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), 'build/\n.chalk/local/\n');
  writeFileSync(join(root, 'tracked.js'), 'a');
  execFileSync('git', ['add', 'tracked.js'], { cwd: root });
  writeFileSync(join(root, 'untracked.js'), 'a');
  mkdirSync(join(root, 'build')); writeFileSync(join(root, 'build/output.js'), 'a');
  const before = sourceIdentity(root, store.protocol());
  assert.equal(before.status, 'known');
  assert.ok(before.files['tracked.js'] && before.files['untracked.js']);
  assert.ok(!before.files['.chalk/tasks.json'] && !before.files['build/output.js']);
  writeFileSync(join(root, 'build/output.js'), 'b');
  store.appendDecision({ title: 'bookkeeping', why: 'irrelevant' });
  assert.equal(sourceIdentity(root, store.protocol()).digest, before.digest);
  writeFileSync(join(root, 'untracked.js'), 'b');
  assert.notEqual(sourceIdentity(root, store.protocol()).digest, before.digest);
});

test('unreadable source identity and evidence storage errors fail closed', t => {
  const { root, store } = project(t);
  // A tracked file disappearing must be represented in the manifest, not silently lost.
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'check.cjs'], { cwd: root });
  rmSync(join(root, 'check.cjs'));
  assert.ok(sourceIdentity(root, store.protocol()).files['check.cjs']);
  assert.equal(sourceIdentity(join(root, 'missing')).status, 'unknown');
  const unknown = verify(store, { cwd: join(root, 'missing') });
  assert.equal(unknown.green, false);
  assert.equal(unknown.freshness, 'unknown');
  const local = join(root, '.chalk/local');
  rmSync(local, { recursive: true, force: true }); writeFileSync(local, 'not a directory');
  const v = verify(store);
  assert.equal(v.green, false);
  assert.ok(v.evidenceError);
});

test('separate worktree run records only the corresponding task and cwd', t => {
  const { store } = project(t);
  const wd = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-record-wt-')));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  writeFileSync(join(wd, 'check.cjs'), 'console.log("worktree")');
  store.upsertTask({ id: 'task-other', title: 'other', state: 'in-progress', worktree: wd, acceptanceCriteria: [{ text: 'other works' }], tests: [], reviews: [] });
  const r = record(verify(store, { cwd: wd }));
  assert.equal(r.cwd, wd);
  assert.deepEqual(r.before.tasks.map(t => t.id), ['task-other']);
});

test('real CLI verify and done both leave verification records', t => {
  const { root, store } = project(t);
  const meta = store.meta(); meta.protocol.review = { required: false }; store.saveMeta(meta);
  for (const args of [['verify'], ['done', 'task-record']]) {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  assert.equal(readdirSync(join(root, '.chalk/local/verification')).length, 2);
});
