import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runAudit } from '../lib/regression.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t, code) {
  const root = mkdtempSync(join(tmpdir(), 'chalk-audit-freshness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: { cmd: 'node check.cjs', when: 'phase' } }; store.saveMeta(meta);
  return { root, store };
}

test('phase audits retain bound receipts and reject source mutations even when commands pass', t => {
  const { root, store } = fixture(t, 'require("fs").writeFileSync("source.js","changed");');
  writeFileSync(join(root, 'source.js'), 'original');
  const result = runAudit(store);
  assert.equal(result.phaseGates.find(g => g.gate === 'test').status, 'pass');
  assert.equal(result.green, false); assert.equal(result.phaseVerification.freshness, 'stale');
  const record = JSON.parse(readFileSync(result.phaseVerification.evidence.path, 'utf8'));
  assert.equal(record.mode, 'phase'); assert.equal(record.green, false);
  assert.ok(record.before.configDigest && record.before.tasksDigest);
  assert.notEqual(record.before.source.digest, record.after.source.digest);
  writeFileSync(join(root, 'source.js'), 'original');
  const cli = spawnSync(process.execPath, [CLI, 'audit'], { cwd: root, encoding: 'utf8' });
  assert.equal(cli.status, 2, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /phase verification inputs stale/);
  assert.match(cli.stdout, /phase verification record:/);
});

test('phase audits reject unknown source identity and retain its failed evidence', t => {
  const { root, store } = fixture(t, 'console.log("command passed")');
  const outside = mkdtempSync(join(tmpdir(), 'chalk-audit-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  // A directory junction avoids Windows file-symlink privilege assumptions.
  symlinkSync(outside, join(root, 'external'), 'junction');
  const result = runAudit(store);
  assert.equal(result.green, false); assert.equal(result.phaseVerification.freshness, 'unknown');
  const record = JSON.parse(readFileSync(result.phaseVerification.evidence.path, 'utf8'));
  assert.equal(record.before.source.status, 'unknown'); assert.equal(record.green, false);
  assert.equal(readdirSync(join(root, '.chalk/local/verification')).length, 1);
});

test('phase audits enforce visible locked-test integrity and record the broken contract', t => {
  const { root, store } = fixture(t, 'console.log("toolchain passed")');
  writeFileSync(join(root, 'visible.txt'), 'locked');
  store.upsertTask({ id: 'task-visible', title: 'visible contract', state: 'in-progress', acceptanceCriteria: [{ text: 'preserve the contract' }], tests: [store.lockTest(join(root, 'visible.txt'))] });
  writeFileSync(join(root, 'visible.txt'), 'broken before audit');
  const result = runAudit(store);
  assert.equal(result.phaseVerification.toolchainGreen, true);
  assert.equal(result.phaseVerification.integrityGreen, false);
  assert.equal(result.green, false);
  const receipt = JSON.parse(readFileSync(result.phaseVerification.evidence.path, 'utf8'));
  assert.equal(receipt.green, false);
  assert.ok(receipt.integrity.some(t => t.broken.some(lock => lock.path === 'visible.txt')));
});

test('phase audits execute active browser specifications and retain failed command output', t => {
  const { root, store } = fixture(t, 'console.log("toolchain passed")');
  writeFileSync(join(root, 'visible.test.yaml'), 'id: visible\nsteps: []\n');
  writeFileSync(join(root, 'browser.cjs'), 'console.log("browser executed");console.error("browser failed");process.exit(7);');
  store.upsertTask({ id: 'task-browser', title: 'browser contract', state: 'in-progress', acceptanceCriteria: [{ text: 'exercise browser behavior' }], tests: [store.lockTest(join(root, 'visible.test.yaml'))] });
  const meta = store.meta(); meta.protocol.e2e.command = 'node browser.cjs'; store.saveMeta(meta);
  const result = runAudit(store);
  assert.equal(result.phaseVerification.toolchainGreen, true);
  assert.equal(result.phaseVerification.e2eGreen, false);
  assert.equal(result.green, false);
  const receipt = JSON.parse(readFileSync(result.phaseVerification.evidence.path, 'utf8'));
  assert.equal(receipt.green, false);
  const command = receipt.e2e[0].execution;
  assert.equal(command.exitCode, 7); assert.equal(command.status, 'fail');
  assert.match(readFileSync(command.stdoutPath, 'utf8'), /browser executed/);
  assert.match(readFileSync(command.stderrPath, 'utf8'), /browser failed/);
});
