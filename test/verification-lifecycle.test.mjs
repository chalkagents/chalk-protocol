import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t, script = 'console.log("checked")') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-lifecycle-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), script);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-active', title: 'active', state: 'in-progress', acceptanceCriteria: [{ text: 'works' }], tests: [] });
  return { root, store };
}
const receipt = result => JSON.parse(readFileSync(result.evidence.path, 'utf8'));

test('restored source bytes and transient inputs cannot yield fresh green evidence', t => {
  const { root, store } = fixture(t, 'const fs=require("fs"); const before=fs.readFileSync("source.js"); fs.writeFileSync("source.js","changed"); console.log(fs.readFileSync("source.js","utf8")); fs.writeFileSync("source.js",before);');
  writeFileSync(join(root, 'source.js'), 'original');
  const restored = verify(store);
  assert.equal(restored.toolchainGreen, true);
  assert.equal(readFileSync(join(root, 'source.js'), 'utf8'), 'original');
  assert.equal(restored.freshness, 'stale'); assert.equal(restored.green, false);
  writeFileSync(join(root, 'check.cjs'), 'const fs=require("fs"); fs.writeFileSync("transient.log","input"); console.log(fs.readFileSync("transient.log","utf8")); fs.unlinkSync("transient.log");');
  const transient = verify(store);
  assert.equal(transient.toolchainGreen, true);
  assert.equal(existsSync(join(root, 'transient.log')), false);
  assert.equal(transient.freshness, 'stale'); assert.equal(transient.green, false);
});

test('non-Git input manifests include ordinary log and conventionally named directory inputs', t => {
  const { root, store } = fixture(t, 'require("fs").writeFileSync("fixture.log","changed");');
  for (const dir of ['build', 'dist', 'vendor', 'node_modules']) {
    mkdirSync(join(root, dir)); writeFileSync(join(root, dir, 'input.txt'), 'source');
  }
  writeFileSync(join(root, 'fixture.log'), 'original');
  const source = sourceIdentity(root);
  for (const path of ['fixture.log', 'build/input.txt', 'dist/input.txt', 'vendor/input.txt', 'node_modules/input.txt']) assert.ok(source.files[path], path);
  const result = verify(store); assert.equal(result.freshness, 'stale'); assert.equal(result.green, false);
  const module = pathToFileURL(resolve('lib/verification-record.mjs')).href;
  const probe = execFileSync(process.execPath, ['--input-type=module', '-e', `import {sourceIdentity} from ${JSON.stringify(module)}; console.log(JSON.stringify(sourceIdentity(process.cwd())));`], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: join(root, 'no-git'), Path: join(root, 'no-git') } });
  assert.equal(JSON.parse(probe).status, 'unknown', 'probe failure must not masquerade as a non-Git repository');
});

test('browser verification archives complete command outcomes and streams, including failure', t => {
  const { root, store } = fixture(t);
  writeFileSync(join(root, 'flow.test.yaml'), 'id: flow\nsteps: []\n');
  writeFileSync(join(root, 'browser.cjs'), 'process.stdout.write("b".repeat(2*1024*1024)); console.error("browser stderr");');
  const task = store.task('task-active'); task.tests = [store.lockTest(join(root, 'flow.test.yaml'))]; store.upsertTask(task);
  const meta = store.meta(); meta.protocol.e2e.command = 'node browser.cjs'; store.saveMeta(meta);
  const passed = verify(store), entry = receipt(passed).e2e[0].execution;
  assert.equal(passed.green, true);
  assert.match(entry.cmd, /browser.cjs --spec flow.test.yaml --out/);
  assert.equal(entry.exitCode, 0); assert.equal(entry.signal, null); assert.equal(entry.errorCode, null);
  assert.ok(entry.startedAt && entry.finishedAt);
  assert.equal(readFileSync(entry.stdoutPath).length, 2*1024*1024);
  assert.match(readFileSync(entry.stderrPath, 'utf8'), /browser stderr/);
  writeFileSync(join(root, 'browser.cjs'), 'console.log("failed browser"); console.error("reason"); process.exit(7);');
  const failed = verify(store), failedEntry = receipt(failed).e2e[0].execution;
  assert.equal(failed.green, false); assert.equal(failedEntry.exitCode, 7);
  assert.match(readFileSync(failedEntry.stdoutPath, 'utf8'), /failed browser/);
  assert.match(readFileSync(failedEntry.stderrPath, 'utf8'), /reason/);
});

test('integrity evidence includes other active worktrees and done contracts under all-locks', t => {
  const { root, store } = fixture(t);
  const other = mkdtempSync(join(tmpdir(), 'chalk-lifecycle-other-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  writeFileSync(join(root, 'done.txt'), 'done contract'); writeFileSync(join(other, 'active.txt'), 'active contract');
  store.upsertTask({ id: 'task-other', title: 'other', state: 'in-progress', worktree: other, acceptanceCriteria: [{ text: 'other works' }], tests: [{ path: 'active.txt', sha256: store.lockTest(join(other, 'active.txt')).sha256 }] });
  store.upsertTask({ id: 'task-done', title: 'done', state: 'done', acceptanceCriteria: [{ text: 'done works' }], tests: [store.lockTest(join(root, 'done.txt'))] });
  const meta = store.meta(); meta.protocol.integrity = 'all-locks'; store.saveMeta(meta);
  const result = verify(store), record = receipt(result);
  assert.equal(result.green, true);
  assert.deepEqual(record.before.tasks.map(t => t.id), ['task-active']);
  assert.deepEqual(record.before.integrityInputs.map(t => t.id), ['task-active', 'task-done', 'task-other']);
  assert.ok(record.before.integrityInputs.find(t => t.id === 'task-other').tests[0].actual);
  writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"), p=${JSON.stringify(join(other, 'active.txt'))};const text=fs.readFileSync(p);fs.writeFileSync(p,"temporary");fs.writeFileSync(p,text);`);
  const changed = verify(store);
  assert.equal(changed.integrityGreen, true, 'the original locked bytes were restored');
  assert.equal(changed.freshness, 'stale'); assert.equal(changed.green, false);
});

test('terminating the verifier archives interruption evidence and stops its command tree', async t => {
  const { root } = fixture(t, 'console.log("started");setTimeout(()=>require("fs").writeFileSync(".chalk/local/escaped","still alive"),3000);setInterval(()=>{},1000);');
  const child = spawn(process.execPath, [CLI, 'verify'], { cwd: root, stdio: 'ignore' });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* exited */ } });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const until = async fn => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { try { const value = fn(); if (value) return value; } catch { /* not written yet */ } await pause(50); } throw new Error('timed out waiting for verifier'); };
  const file = await until(() => {
    const base = join(root, '.chalk/local/verification');
    const path = join(base, readdirSync(base)[0], 'run.json');
    const r = JSON.parse(readFileSync(path));
    const command = r.toolchain.find(g => g.gate === 'test');
    return command?.stdoutPath && readFileSync(command.stdoutPath, 'utf8').includes('started') && path;
  });
  const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await exited;
  const record = await until(() => { const r = JSON.parse(readFileSync(file)); return r.status === 'interrupted' && r; });
  assert.equal(record.green, false); assert.ok(record.finishedAt);
  const command = record.toolchain.find(g => g.gate === 'test');
  assert.equal(command.status, 'fail'); assert.equal(command.errorCode, 'ECANCELED');
  assert.match(readFileSync(command.stdoutPath, 'utf8'), /started/);
  assert.ok(command.stdoutPath.startsWith(file.slice(0, -'run.json'.length)), 'logs were archived out of temporary spool storage');
  await pause(3300);
  assert.equal(existsSync(join(root, '.chalk/local/escaped')), false, 'the detached command cannot survive controller cancellation');
});
