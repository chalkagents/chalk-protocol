import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

function fixture(t, code) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-stream-policy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}

test('log write failures kill the command and retain a finished failed outcome', async t => {
  const { root, store } = fixture(t, 'console.log("trigger capture");setTimeout(()=>require("fs").writeFileSync(".chalk/local/survived","bad"),700);');
  const preload = join(root, 'inject.mjs');
  writeFileSync(preload, 'import fs from "node:fs";import{syncBuiltinESMExports}from"node:module";if(process.argv[1]?.endsWith("verification-command.mjs")){fs.writeSync=()=>{throw Object.assign(new Error("injected disk full"),{code:"ENOSPC"});};syncBuiltinESMExports();}');
  const original = process.env.NODE_OPTIONS;
  let result;
  try { process.env.NODE_OPTIONS = `${original || ''} --import ${JSON.stringify(preload)}`; result = verify(store); }
  finally { if (original === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = original; }
  assert.equal(result.green, false);
  const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  const command = receipt.toolchain.find(g => g.gate === 'test');
  assert.equal(command.status, 'fail'); assert.equal(command.errorCode, 'ENOSPC');
  assert.ok(command.finishedAt && command.startedAt && command.cmd);
  assert.ok(command.signal || command.exitCode !== null);
  assert.match(command.captureError, /disk full/);
  assert.ok(existsSync(command.stdoutPath) && existsSync(command.stderrPath));
  await new Promise(r => setTimeout(r, 900));
  assert.equal(existsSync(join(root, '.chalk/local/survived')), false);
});

// Windows post-parent-exit supervision: https://github.com/chalkagents/chalk-protocol/issues/251
test('POSIX supervision waits for descendants that close every output stream', { skip: process.platform === 'win32' }, t => {
  const { root, store } = fixture(t, 'require("child_process").spawn(process.execPath,["worker.cjs"],{stdio:"ignore"}).unref();');
  writeFileSync(join(root, 'worker.cjs'), 'setTimeout(()=>require("fs").writeFileSync(".chalk/local/descendant-finished","yes"),700);');
  const result = verify(store), command = result.toolchain.find(g => g.gate === 'test');
  assert.equal(result.green, true, JSON.stringify(result));
  assert.equal(readFileSync(join(root, '.chalk/local/descendant-finished'), 'utf8'), 'yes');
  assert.ok(Date.parse(command.finishedAt) - Date.parse(command.startedAt) >= 700);
});

test('changes to Git ignore policy cannot conceal transient ordinary inputs', t => {
  for (const restore of [false, true]) {
    const { root, store } = fixture(t, `const fs=require("fs"),p=".git/info/exclude",original=fs.readFileSync(p);fs.writeFileSync("ephemeral.js","used");fs.readFileSync("ephemeral.js");fs.unlinkSync("ephemeral.js");fs.appendFileSync(p,"\\nephemeral.js\\n");${restore ? 'setTimeout(()=>fs.writeFileSync(p,original),250);' : ''}`);
    execFileSync('git', ['init', '-q'], { cwd: root });
    const result = verify(store);
    assert.equal(result.toolchainGreen, true);
    assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
    assert.ok(result.toolchain.find(g => g.gate === 'test').inputChanges.some(p => p.includes('info/exclude')));
  }
});

test('external ignore policies are monitored even when initially absent', t => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-external-ignore-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const policy = join(outside, 'ignore');
  const { root, store } = fixture(t, `const fs=require("fs"),p=${JSON.stringify(policy)};fs.writeFileSync(p,"ephemeral.js\\n");fs.writeFileSync("ephemeral.js","used");fs.readFileSync("ephemeral.js");fs.unlinkSync("ephemeral.js");fs.unlinkSync(p);`);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'core.excludesfile', policy], { cwd: root });
  const result = verify(store);
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  assert.ok(result.toolchain.find(g => g.gate === 'test').inputChanges.includes(`git-policy:${policy}`));
});

test('staging unchanged files does not reorder the source policy identity', t => {
  const { root, store } = fixture(t, 'console.log("checked")');
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const dir of ['a', 'z']) { mkdirSync(join(root, dir)); writeFileSync(join(root, dir, 'source.js'), 'unchanged'); }
  execFileSync('git', ['add', 'check.cjs', 'a/source.js'], { cwd: root });
  const before = sourceIdentity(root, store.protocol());
  execFileSync('git', ['add', 'z/source.js'], { cwd: root });
  const after = sourceIdentity(root, store.protocol());
  assert.equal(before.status, 'known'); assert.equal(after.status, 'known');
  assert.equal(after.digest, before.digest);
});
