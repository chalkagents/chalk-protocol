import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

function fixture(t, code = 'console.log("checked")') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-supervision-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}

test('transient inputs inside existing empty directories invalidate verification', t => {
  const { root, store } = fixture(t, 'const fs=require("fs");fs.writeFileSync("empty/transient.js","used");console.log(fs.readFileSync("empty/transient.js","utf8"));fs.unlinkSync("empty/transient.js");');
  mkdirSync(join(root, 'empty'));
  const result = verify(store);
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  assert.ok(result.toolchain.find(g => g.gate === 'test').inputChanges.includes('empty/transient.js'));
});

test('background descendants retain supervision and complete output capture after the shell exits', t => {
  const { root, store } = fixture(t, 'const {spawn}=require("child_process");spawn(process.execPath,["worker.cjs"],{stdio:["ignore",1,2]}).unref();');
  writeFileSync(join(root, 'source.txt'), 'original');
  writeFileSync(join(root, 'worker.cjs'), 'setTimeout(()=>{console.log("late stdout");console.error("late stderr");require("fs").writeFileSync("source.txt","changed");},700);');
  const result = verify(store), gate = result.toolchain.find(g => g.gate === 'test');
  assert.match(readFileSync(gate.stdoutPath, 'utf8'), /late stdout/);
  assert.match(readFileSync(gate.stderrPath, 'utf8'), /late stderr/);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'changed');
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  assert.ok(Date.parse(gate.finishedAt) - Date.parse(gate.startedAt) >= 700);
});

test('snapshot exceptions leave an inspectable failed receipt before any command starts', t => {
  const { root, store } = fixture(t);
  // Replace a legitimately locked file with a directory. This makes snapshotting fail without
  // depending on file-symlink creation privileges on Windows.
  writeFileSync(join(root, 'contract.txt'), 'locked contract');
  const lock = store.lockTest(join(root, 'contract.txt'));
  rmSync(join(root, 'contract.txt'));
  mkdirSync(join(root, 'contract.txt'));
  store.upsertTask({ id: 'task-invalid', title: 'invalid snapshot', state: 'in-progress', acceptanceCriteria: [{ text: 'contract' }], tests: [lock] });
  const result = verify(store);
  assert.equal(result.green, false); assert.ok(result.evidence?.path);
  const record = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  assert.equal(record.status, 'error'); assert.equal(record.green, false);
  assert.match(record.error, /integrity input/); assert.ok(record.startedAt && record.finishedAt);
  assert.deepEqual(record.toolchain, []);
});

test('Git-ignored build output stays excluded while ordinary empty directories are watched', t => {
  const { root, store } = fixture(t, 'const fs=require("fs");fs.writeFileSync("build/output.log","generated");');
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), '/build\n.chalk/local/\n');
  mkdirSync(join(root, 'empty'));
  mkdirSync(join(root, 'build'));
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result)); assert.equal(result.freshness, 'fresh');
});

test('source manifests retain filenames that are special JavaScript object keys', t => {
  const { root } = fixture(t);
  writeFileSync(join(root, '__proto__'), 'original');
  const before = sourceIdentity(root);
  assert.equal(Object.hasOwn(before.files, '__proto__'), true);
  writeFileSync(join(root, '__proto__'), 'modified');
  assert.notEqual(sourceIdentity(root).digest, before.digest);
});
