import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t, code) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-recovery-boundary-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}

test('creating and deleting an ignored output directory closes the namespace gate', t => {
  const { root, store } = fixture(t, 'const fs=require("fs");fs.mkdirSync("build");fs.writeFileSync("build/output.log","generated");fs.rmSync("build",{recursive:true});');
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), '/build\n.chalk/local/\n');
  const result = verify(store);
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false, JSON.stringify(result)); assert.equal(result.freshness, 'stale');
  assert.ok(result.observation.inputChanges.some(path => path.startsWith('source-directory:')));
});

test('a pre-existing ignored output directory permits generated file creation and deletion', t => {
  const { root, store } = fixture(t, 'const fs=require("fs");fs.writeFileSync("build/output.log","generated");fs.unlinkSync("build/output.log");');
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), '/build\n.chalk/local/\n');
  mkdirSync(join(root, 'build'));
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result)); assert.equal(result.freshness, 'fresh');
  assert.deepEqual(result.observation, { inputChanges: [], monitorError: null });
});

test('directory-only ignores cannot hide transient ordinary files or ambiguous deletions', t => {
  for (const code of [
    'fs.writeFileSync("build","temporary input");fs.readFileSync("build");fs.unlinkSync("build");',
    'fs.writeFileSync("build","temporary input");fs.readFileSync("build");fs.unlinkSync("build");fs.mkdirSync("build");',
    'fs.mkdirSync("build");fs.writeFileSync("build/output","generated");fs.rmSync("build",{recursive:true});',
    'fs.rmSync("build",{recursive:true});fs.writeFileSync("build","temporary input");fs.readFileSync("build");fs.unlinkSync("build");',
  ]) {
    const { root, store } = fixture(t, 'const fs=require("fs");' + code);
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'build/\n.chalk/local/\n');
    if (code.startsWith('fs.rmSync')) execFileSync(process.execPath, ['-e', 'require("fs").mkdirSync("build")'], { cwd: root });
    const result = verify(store);
    assert.equal(result.green, false, JSON.stringify(result));
    assert.ok(['unknown', 'stale'].includes(result.freshness));
  }
});

test('blocked temporary recovery metadata does not prevent normal outcome archival', t => {
  const { store } = fixture(t, 'const fs=require("fs"),path=require("path"),base=".chalk/local/verification",id=fs.readdirSync(base)[0],run=JSON.parse(fs.readFileSync(base+"/"+id+"/run.json")),gate=run.toolchain.find(g=>g.gate==="test");fs.mkdirSync(path.join(path.dirname(gate.stdoutPath),"result.json"));console.log("retained stdout");console.error("retained stderr");process.exit(7);');
  const result = verify(store);
  assert.equal(result.green, false);
  const record = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  const gate = record.toolchain.find(g => g.gate === 'test');
  assert.equal(gate.status, 'fail'); assert.equal(gate.exitCode, 7);
  assert.equal(gate.signal, null); assert.equal(gate.errorCode, null);
  assert.ok(gate.finishedAt && gate.startedAt && gate.cmd && gate.recoveryError);
  assert.match(readFileSync(gate.stdoutPath, 'utf8'), /retained stdout/);
  assert.match(readFileSync(gate.stderrPath, 'utf8'), /retained stderr/);
  assert.ok(gate.stdoutPath.startsWith(result.evidence.dir));
});
