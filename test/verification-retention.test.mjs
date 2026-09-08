import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

const FIRST = 'process.stdout.write("original output\\n".repeat(100000));process.stderr.write("original stderr\\n");';

function fixture(t, change) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-retention-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'first.cjs'), FIRST);
  writeFileSync(join(root, 'second.cjs'), `const fs=require("fs"),p=".chalk/local/verification",id=fs.readdirSync(p)[0],r=JSON.parse(fs.readFileSync(p+"/"+id+"/run.json")),g=r.toolchain.find(x=>x.gate==="lint");if(!fs.existsSync(g.recovery.stdoutPath))throw Error("recovery lost before final gate");fs.writeFileSync(".chalk/local/recovery-dir.txt",g.recovery.dir);${change}`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { lint: 'node first.cjs', test: 'node second.cjs' }; store.saveMeta(meta);
  return { root, store };
}

for (const change of ['delete', 'truncate', 'redirect']) {
  test(`a later gate cannot ${change} earlier output and produce GREEN`, t => {
    const mutation = { delete: 'fs.unlinkSync(g.stdoutPath);', truncate: 'fs.writeFileSync(g.stdoutPath,"truncated");fs.writeFileSync(g.stderrPath,"");', redirect: 'fs.unlinkSync(g.stdoutPath);fs.symlinkSync(require("path").resolve("first.cjs"),g.stdoutPath);' }[change];
    const { root, store } = fixture(t, mutation);
    const result = verify(store), lint = result.toolchain.find(g => g.gate === 'lint');
    const recoveryDir = readFileSync(join(root, '.chalk/local/recovery-dir.txt'), 'utf8');
    t.after(() => rmSync(recoveryDir, { recursive: true, force: true }));
    assert.equal(result.toolchainGreen, true); assert.equal(result.green, false);
    assert.equal(result.freshness, 'fresh'); assert.match(result.evidenceError, /archive is missing, changed/);
    assert.equal(readFileSync(lint.stdoutPath, 'utf8'), 'original output\n'.repeat(100000));
    assert.equal(readFileSync(lint.stderrPath, 'utf8'), 'original stderr\n');
    assert.equal(readFileSync(join(root, 'first.cjs'), 'utf8'), FIRST);
    assert.ok(lint.recoveredStreams.includes('stdout'));
    const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
    assert.equal(receipt.green, false); assert.equal(receipt.status, 'error');
    assert.match(receipt.evidenceError, /lint stdout/);
  });
}

test('successful multi-gate verification releases recovery copies only after retaining complete archives', t => {
  const { root, store } = fixture(t, 'console.log("second gate checked recovery");');
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  const dir = readFileSync(join(root, '.chalk/local/recovery-dir.txt'), 'utf8');
  assert.equal(existsSync(dir), false);
  const lint = result.toolchain.find(g => g.gate === 'lint');
  assert.equal(readFileSync(lint.stdoutPath, 'utf8'), 'original output\n'.repeat(100000));
  assert.equal(lint.recovery, undefined);
  assert.equal(lint.streams.stdout.bytes, 1600000);
});
