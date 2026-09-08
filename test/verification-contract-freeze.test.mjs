import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t, code = 'console.log("checked")') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-frozen-contract-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  writeFileSync(join(root, 'flow.test.yaml'), 'id: flow\nsteps: []\n');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-active', title: 'active', state: 'in-progress', acceptanceCriteria: [{ text: 'contract' }], tests: [store.lockTest(join(root, 'flow.test.yaml'))] });
  return { root, store };
}

test('temporary lock removal cannot bypass the captured integrity contract', t => {
  const { root, store } = fixture(t);
  writeFileSync(join(root, 'locked.txt'), 'locked');
  const task = store.task('task-active'); task.tests.push(store.lockTest(join(root, 'locked.txt'))); store.upsertTask(task);
  writeFileSync(join(root, 'locked.txt'), 'broken');
  const original = readFileSync(store.p.tasks, 'utf8');
  writeFileSync(join(root, 'check.cjs'), 'const fs=require("fs"),path=".chalk/tasks.json";const tasks=JSON.parse(fs.readFileSync(path));tasks[0].tests=tasks[0].tests.filter(t=>t.path!=="locked.txt");fs.writeFileSync(path,JSON.stringify(tasks));');
  writeFileSync(join(root, 'browser.cjs'), `require("fs").writeFileSync(".chalk/tasks.json",${JSON.stringify(original)});`);
  const meta = store.meta(); meta.protocol.e2e.command = 'node browser.cjs'; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(readFileSync(store.p.tasks, 'utf8'), original, 'the original task JSON was restored');
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.integrityGreen, false); assert.equal(result.green, false);
  assert.ok(result.integrity.some(task => task.broken.some(lock => lock.path === 'locked.txt')));
  assert.equal(result.freshness, 'stale');
});

test('browser checks use captured configuration even if a toolchain command replaces it', t => {
  const { root, store } = fixture(t, 'const fs=require("fs");const p=".chalk/chalk.json",m=JSON.parse(fs.readFileSync(p));m.protocol.e2e.command="node -e process.exit(0)";fs.writeFileSync(p,JSON.stringify(m));');
  writeFileSync(join(root, 'browser.cjs'), 'console.error("original browser check");process.exit(7);');
  const meta = store.meta(); meta.protocol.e2e.command = 'node browser.cjs'; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.green, false); assert.equal(result.e2e[0].execution.exitCode, 7);
  assert.match(readFileSync(result.e2e[0].execution.stderrPath, 'utf8'), /original browser check/);
});

test('archive failures retain complete command outcomes and recoverable stream references', t => {
  const { store } = fixture(t, 'const fs=require("fs"),base=".chalk/local/verification",id=fs.readdirSync(base)[0];fs.mkdirSync(base+"/"+id+"/test.stdout.log");console.log("recoverable stdout");console.error("recoverable stderr");process.exit(7);');
  const result = verify(store);
  assert.equal(result.green, false); assert.ok(result.evidenceError);
  const record = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  const gate = record.toolchain.find(g => g.gate === 'test');
  assert.equal(gate.exitCode, 7); assert.equal(gate.status, 'fail'); assert.ok(gate.archiveError);
  assert.ok(gate.startedAt && gate.finishedAt && gate.cmd);
  assert.match(readFileSync(gate.stdoutPath, 'utf8'), /recoverable stdout/);
  assert.match(readFileSync(gate.stderrPath, 'utf8'), /recoverable stderr/);
  assert.equal(JSON.parse(readFileSync(gate.recoveryPath)).exitCode, 7);
  t.after(() => rmSync(dirname(gate.recoveryPath), { recursive: true, force: true }));
});

test('a passing browser report cannot override a failed subprocess', t => {
  const { root, store } = fixture(t);
  writeFileSync(join(root, 'browser.cjs'), 'const fs=require("fs"),out=process.argv[process.argv.indexOf("--out")+1];fs.writeFileSync(out+"/run.json",JSON.stringify({status:"passed"}));process.exit(7);');
  const meta = store.meta(); meta.protocol.e2e.command = 'node browser.cjs'; store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.e2e[0].execution.exitCode, 7);
  assert.equal(result.e2e[0].status, 'failed'); assert.equal(result.e2eGreen, false); assert.equal(result.green, false);
});
