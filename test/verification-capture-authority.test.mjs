import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t, code) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-capture-authority-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'source.txt'), 'source must survive');
  mkdirSync(join(root, 'source-dir'));
  writeFileSync(join(root, 'source-dir/test.stdout.log'), 'source archive name must survive');
  writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),path=require("path"),base=".chalk/local/verification",dir=path.join(base,fs.readdirSync(base)[0]),record=JSON.parse(fs.readFileSync(path.join(dir,"run.json"))),gate=record.toolchain.find(g=>g.gate==="test");${code}`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}

for (const mode of ['replace', 'truncate']) {
  test(`live stdout ${mode} cannot certify missing captured output`, t => {
    const change = mode === 'replace' ? 'fs.unlinkSync(gate.stdoutPath);fs.writeFileSync(gate.stdoutPath,"");' : 'fs.truncateSync(gate.stdoutPath,0);';
    const { store } = fixture(t, `process.stdout.write("before\\n");setTimeout(()=>{${change}process.stdout.write("after\\n");},150);`);
    const result = verify(store), command = result.toolchain.find(g=>g.gate==='test');
    assert.equal(command.exitCode, 0);
    const output = readFileSync(command.stdoutPath, 'utf8');
    assert.ok(!result.green || output === 'before\nafter\n', JSON.stringify({ green: result.green, output }));
    assert.equal(result.green, false, 'observed spool damage closes verification even when recoverable');
    if (mode === 'replace') assert.equal(output, 'before\nafter\n', 'the open descriptor retains unlinked captured output');
    assert.ok(command.captureError || command.archiveError || command.retentionError);
  });
}

test('initial archive replacement preserves the source behind a destination symlink', t => {
  const { root, store } = fixture(t, 'fs.symlinkSync(path.resolve("source.txt"),path.join(dir,"test.stdout.log"));console.log("captured output");');
  const result = verify(store);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'source must survive');
  const command = result.toolchain.find(g=>g.gate==='test');
  assert.equal(command.exitCode, 0);
  assert.equal(readFileSync(command.stdoutPath, 'utf8'), 'captured output\n');
});

test('redirected archive parents never overwrite source or receive verification metadata', t => {
  const { root, store } = fixture(t, 'fs.renameSync(dir,dir+"-saved");fs.symlinkSync(path.resolve("source-dir"),dir,"junction");console.log("captured output");');
  const result = verify(store);
  assert.equal(readFileSync(join(root, 'source-dir/test.stdout.log'), 'utf8'), 'source archive name must survive');
  assert.equal(existsSync(join(root, 'source-dir/run.json')), false);
  assert.equal(result.green, false); assert.ok(result.evidenceError);
  const command = result.toolchain.find(g=>g.gate==='test');
  assert.equal(command.exitCode, 0);
  assert.equal(readFileSync(command.stdoutPath, 'utf8'), 'captured output\n');
});

test('receipt updates never follow a precreated temporary-file symlink into source', t => {
  const { root, store } = fixture(t, 'fs.symlinkSync(path.resolve("source.txt"),path.join(dir,"run.json.tmp"));console.log("captured output");');
  const result = verify(store);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'source must survive');
  assert.equal(result.green, true, JSON.stringify(result));
});
