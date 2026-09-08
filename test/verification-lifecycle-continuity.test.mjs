import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { runVerificationCommand } from '../lib/verification-command.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-continuity-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  return { root, store: new Store(root) };
}

test('verification observes transient inputs during final input collection', t => {
  const { root, store } = fixture(t);
  const meta = store.meta(); meta.protocol.verify = { lint: 'node -e "console.log(1)"', test: 'node -e "console.log(2)"' }; store.saveMeta(meta);
  // A synchronous controller hook represents work between command supervisors. The
  // production verify call must keep observing inputs even while its thread is busy.
  const config = store.protocol.bind(store);
  let calls = 0;
  store.protocol = () => {
    const value = config();
    if (++calls === 2) {
      writeFileSync(join(root, 'ephemeral.js'), 'used between stages');
      readFileSync(join(root, 'ephemeral.js'));
      rmSync(join(root, 'ephemeral.js'));
    }
    return value;
  };
  const result = verify(store);
  assert.equal(calls, 2, 'mutation happens during final input collection');
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
});

test('deadline finishes evidence even when an escaped descendant retains pipes', t => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'worker.cjs'), 'console.log("escaped output");setTimeout(()=>console.log("late output"),15000);');
  writeFileSync(join(root, 'check.cjs'), 'const p=require("child_process").spawn(process.execPath,["worker.cjs"],{detached:true,stdio:["ignore",1,2]});require("fs").writeFileSync(".chalk/local/worker.pid",String(p.pid));p.unref();');
  const started = Date.now();
  let command;
  try { command = runVerificationCommand({ cwd: root, gate: 'test', cmd: 'node check.cjs', timeoutMs: 5000,
    stdoutPath: join(root, '.chalk/local/out.log'), stderrPath: join(root, '.chalk/local/err.log') }); }
  finally { try { process.kill(Number(readFileSync(join(root, '.chalk/local/worker.pid'), 'utf8')), 'SIGKILL'); } catch {} }
  assert.ok(Date.now() - started < 10000, 'cancellation must not wait for the escaped worker to exit');
  assert.equal(command.status, 'fail'); assert.equal(command.errorCode, 'ETIMEDOUT');
  assert.ok(command.finishedAt);
  assert.match(readFileSync(command.stdoutPath, 'utf8'), /escaped output/);
  assert.equal(command.outputComplete, false, 'unfinished inherited pipes cannot be reported as complete output');
});

test('a detached worker cannot hide an input transition between lint and test', t => {
  const { root, store } = fixture(t);
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, 'lint.cjs'), 'require("child_process").spawn(process.execPath,["worker.cjs"],{detached:true,stdio:"ignore"}).unref();');
  writeFileSync(join(root, 'worker.cjs'), `const fs=require('fs');const started=Date.now();const timer=setInterval(()=>{
    const dir='.chalk/local/verification';
    const active=fs.readdirSync(dir).some(id=>{try{return JSON.parse(fs.readFileSync(dir+'/'+id+'/run.json')).toolchain.some(g=>g.gate==='test'&&g.status==='running');}catch{return false;}});
    if(active){fs.writeFileSync('ephemeral.js','used');fs.readFileSync('ephemeral.js');fs.unlinkSync('ephemeral.js');fs.writeFileSync('.chalk/local/transition','observed');clearInterval(timer);}
    if(Date.now()-started>5000){clearInterval(timer);process.exitCode=2;}
  },1);`);
  writeFileSync(join(root, 'test.cjs'), `const fs=require('fs');const started=Date.now();const timer=setInterval(()=>{
    if(fs.existsSync('.chalk/local/transition')){console.log(fs.readFileSync('.chalk/local/transition','utf8'));clearInterval(timer);}
    if(Date.now()-started>5000){clearInterval(timer);process.exitCode=2;}
  },10);`);
  const meta = store.meta(); meta.protocol.verify = { lint: 'node lint.cjs', test: 'node test.cjs' }; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(readFileSync(join(root, '.chalk/local/transition'), 'utf8'), 'observed');
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  assert.ok(result.observation.inputChanges.includes('ephemeral.js'));
});

test('continuous observation preserves unchanged multi-gate verification', t => {
  const { store } = fixture(t);
  const meta = store.meta(); meta.protocol.verify = { lint: 'node -e "console.log(1)"', test: 'node -e "console.log(2)"' }; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  assert.deepEqual(result.observation, { inputChanges: [], monitorError: null });
});


test('controller interruption archives escaped-descendant output within a bound', async t => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'worker.cjs'), 'console.log("before interruption");require("fs").writeFileSync(".chalk/local/worker.pid",String(process.pid));setTimeout(()=>{},10000);');
  writeFileSync(join(root, 'check.cjs'), 'require("child_process").spawn(process.execPath,["worker.cjs"],{detached:true,stdio:["ignore",1,2]}).unref();');
  const request = { cwd: root, gate: 'test', cmd: 'node check.cjs', timeoutMs: 20000,
    stdoutPath: join(root, '.chalk/local/out.log'), stderrPath: join(root, '.chalk/local/err.log') };
  const module = pathToFileURL(resolve('lib/verification-command.mjs')).href;
  const controller = spawn(process.execPath, ['--input-type=module', '-e', `import {runVerificationCommand} from ${JSON.stringify(module)};runVerificationCommand(${JSON.stringify(request)});`], { stdio: 'ignore' });
  const waitFor = async read => {
    const until = Date.now() + 7000;
    while (Date.now() < until) { try { const value = read(); if (value) return value; } catch {} await new Promise(r => setTimeout(r, 20)); }
    throw new Error('supervisor did not reach the expected state');
  };
  let workerPid;
  try {
    workerPid = await waitFor(() => Number(readFileSync(join(root, '.chalk/local/worker.pid'), 'utf8')));
    const started = Date.now(); controller.kill('SIGTERM');
    const result = await waitFor(() => JSON.parse(readFileSync(join(root, '.chalk/local/test.result.json'), 'utf8')));
    assert.ok(Date.now() - started < 4500);
    assert.equal(result.status, 'fail'); assert.equal(result.errorCode, 'ECANCELED');
    assert.equal(result.outputComplete, false); assert.ok(result.finishedAt);
    assert.match(readFileSync(result.stdoutPath, 'utf8'), /before interruption/);
  } finally {
    controller.kill('SIGKILL');
    if (workerPid) { try { process.kill(workerPid, 'SIGKILL'); } catch {} }
  }
});
