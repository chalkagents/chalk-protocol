import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t, verify = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-coverage-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = verify; store.saveMeta(meta);
  store.upsertTask({ id: 'task-coverage', title: 'coverage', state: 'in-progress', acceptanceCriteria: [{ text: 'report scope' }], tests: [] });
  return { root, store };
}
const run = (root, command, ...args) => spawnSync(process.execPath, [CLI, command, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const last = (store, field) => store.updates().filter(event => event[field]).at(-1)?.[field];

test('verify CLI and events distinguish passed, deferred and unconfigured without opening other gates', t => {
  const { root, store } = fixture(t, { test: 'node check.cjs', build: { cmd: 'node check.cjs', when: 'phase' } });
  const result = run(root, 'verify'); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /passed\s+test/); assert.match(result.stdout, /deferred\s+build/); assert.match(result.stdout, /unconfigured\s+lint/);
  assert.doesNotMatch(result.stdout, /done gate is open|review gate is open|release gate is open/);
  const report = last(store, 'verification'); assert.ok(report);
  assert.equal(report.mode, 'task'); assert.equal(report.executedChecks, 1);
  assert.equal(report.checks.find(check => check.gate === 'test').status, 'passed');
  assert.equal(report.checks.find(check => check.gate === 'build').status, 'deferred');
  assert.equal(report.checks.find(check => check.gate === 'lint').status, 'unconfigured');
  assert.equal(report.review, 'not-evaluated'); assert.equal(report.release, 'not-evaluated');
  assert.equal(report.integrity, 'passed'); assert.equal(report.freshness, 'fresh');
  assert.ok(result.stdout.includes(report.receiptId));
});

test('deferred-only verification explicitly reports no executed checks in CLI and events', t => {
  const { root, store } = fixture(t, { build: { cmd: 'node check.cjs', when: 'phase' } });
  const result = run(root, 'verify'); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no executable checks ran/i);
  assert.match(result.stdout, /deferred\s+build/);
  const report = last(store, 'verification'); assert.ok(report);
  assert.equal(report.executedChecks, 0); assert.equal(report.green, true);
  assert.equal(report.checks.filter(check => check.status === 'passed').length, 0);
});

for (const state of ['failed', 'stale']) {
  test(`verify reports ${state} checks and preserves their actual command outcome`, t => {
    const { root, store } = fixture(t, { test: 'node check.cjs' });
    fs.writeFileSync(join(root, 'source.js'), 'original');
    fs.writeFileSync(join(root, 'check.cjs'), state === 'failed' ? 'process.exit(7);' : 'require("fs").writeFileSync("source.js","changed");');
    const result = run(root, 'verify'); assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`${state}\\s+test`));
    const report = last(store, 'verification'); assert.ok(report);
    const check = report.checks.find(check => check.gate === 'test');
    assert.equal(check.status, state); assert.equal(check.outcome, state === 'stale' ? 'passed' : 'failed');
    assert.equal(report.green, false); assert.equal(report.executedChecks, 1);
  });
}

test('done emits verification scope even when the separate review gate blocks completion', t => {
  const { root, store } = fixture(t, { test: 'node check.cjs' });
  const meta = store.meta(); meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
  const result = run(root, 'done', 'task-coverage'); assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /needs a passing adversarial review/);
  const report = last(store, 'verification'); assert.ok(report);
  assert.equal(report.green, true); assert.equal(report.review, 'not-evaluated');
  assert.equal(store.task('task-coverage').state, 'in-progress');
});

test('unconfigured held-out audits report phase success without claiming independent coverage', t => {
  const { root, store } = fixture(t, { test: 'node check.cjs' });
  const result = run(root, 'audit'); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no independent regression coverage/i);
  assert.match(result.stdout, /passed\s+test/);
  assert.doesNotMatch(result.stdout, /held-out checks PASS/);
  const report = last(store, 'audit'); assert.ok(report);
  assert.equal(report.phase.green, true); assert.equal(report.phase.executedChecks, 1);
  assert.equal(report.heldOut.status, 'unconfigured'); assert.equal(report.heldOut.executed, false);
  assert.equal(report.heldOut.independence, 'not-established'); assert.equal(report.heldOut.lockedFiles, 0);
  assert.deepEqual(store.protocol().regression.lastAudit.coverage, report);
  assert.match(store.updates().filter(event => event.audit).at(-1).title, /configured checks/);
  const stats = run(root, 'stats'); assert.equal(stats.status, 0, stats.stdout + stats.stderr);
  assert.match(stats.stdout, /audits \(configured checks\)/);
  assert.doesNotMatch(stats.stdout, /held-out audit/i);
});

for (const failing of ['phase', 'heldOut']) {
  test(`audit keeps ${failing} failure distinct and withholds private command output`, t => {
    const { root, store } = fixture(t, { build: { cmd: 'node check.cjs', when: 'phase' } });
    if (failing === 'phase') fs.writeFileSync(join(root, 'check.cjs'), 'process.exit(7);');
    fs.writeFileSync(join(root, 'private-command.cjs'), `console.log('PRIVATE_ASSERTION_SENTINEL'); console.error('PRIVATE_ASSERTION_SENTINEL'); process.exit(${failing === 'heldOut' ? 7 : 0});`);
    const meta = store.meta(); meta.protocol.regression.command = 'node private-command.cjs'; store.saveMeta(meta);
    const result = run(root, 'audit'); assert.equal(result.status, 2, result.stdout + result.stderr);
    const report = last(store, 'audit'); assert.ok(report);
    assert.equal(report.phase.green, failing !== 'phase');
    assert.equal(report.heldOut.status, failing === 'heldOut' ? 'failed' : 'passed');
    assert.equal(report.heldOut.executed, true); assert.equal(report.green, false);
    assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(store.updates()), /PRIVATE_ASSERTION_SENTINEL/);
  });
}

test('failed evidence setup reports unknown verification and does not claim completed integrity', t => {
  const { root, store } = fixture(t, { test: 'node check.cjs' });
  const local = join(root, '.chalk/local'); fs.rmSync(local, { recursive: true, force: true }); fs.writeFileSync(local, 'not a directory');
  const result = run(root, 'verify'); assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /verification inputs unknown/);
  const report = last(store, 'verification'); assert.ok(report);
  assert.equal(report.freshness, 'unknown'); assert.equal(report.executedChecks, 0);
  assert.equal(report.integrity, 'not-established'); assert.equal(report.green, false);
});

test('audit labels stale phase checks separately from a passing private command', t => {
  const { root, store } = fixture(t, { test: 'node check.cjs' });
  fs.writeFileSync(join(root, 'source.js'), 'original');
  fs.writeFileSync(join(root, 'check.cjs'), 'require("fs").writeFileSync("source.js","changed");');
  const meta = store.meta(); meta.protocol.regression.command = 'node -e "process.exit(0)"'; store.saveMeta(meta);
  const result = run(root, 'audit'); assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /stale\s+test/); assert.match(result.stdout, /held-out checks PASS/);
  const report = last(store, 'audit'); assert.ok(report);
  assert.equal(report.phase.freshness, 'stale');
  assert.equal(report.phase.checks.find(check => check.gate === 'test').status, 'stale');
  assert.equal(report.heldOut.status, 'passed'); assert.equal(report.green, false);
});

for (const failed of [false, true]) {
  test(`browser-only verification reports an executed ${failed ? 'failed' : 'passed'} specification`, t => {
    const { root, store } = fixture(t);
    fs.writeFileSync(join(root, 'screen.test.yaml'), 'id: screen\n');
    fs.writeFileSync(join(root, 'replay.cjs'), `const fs=require('fs'),path=require('path');const out=process.argv[process.argv.indexOf('--out')+1];fs.writeFileSync(path.join(out,'run.json'),JSON.stringify({status:'${failed ? 'failed' : 'passed'}'}));`);
    const meta = store.meta(); meta.protocol.e2e.command = 'node replay.cjs'; store.saveMeta(meta);
    const task = store.task('task-coverage'); task.tests = [store.lockTest(join(root, 'screen.test.yaml'))]; store.upsertTask(task);
    const result = run(root, 'verify'); assert.equal(result.status, failed ? 2 : 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`${failed ? 'failed' : 'passed'}\\s+e2e`));
    assert.doesNotMatch(result.stdout, /VACUOUS|no executable checks ran/);
    const report = last(store, 'verification'); assert.ok(report);
    assert.equal(report.executedChecks, 1);
    assert.equal(report.checks.find(check => check.kind === 'browser').status, failed ? 'failed' : 'passed');
    assert.equal(report.green, !failed);
  });
}

for (const command of ['verify', 'audit']) {
  test(`${command} retains a completed browser command when the next replay cannot start`, t => {
    const { root, store } = fixture(t);
    fs.writeFileSync(join(root, 'first.test.yaml'), 'id: first\n');
    fs.writeFileSync(join(root, 'second.test.yaml'), 'id: second\n');
    fs.writeFileSync(join(root, 'replay.cjs'), `const fs=require('fs'),path=require('path'),out=process.argv[process.argv.indexOf('--out')+1];fs.writeFileSync(path.join(out,'run.json'),JSON.stringify({status:'failed'}));console.log('first replay executed');fs.writeFileSync('.chalk/runs/second','blocks the next output directory');`);
    const meta = store.meta(); meta.protocol.e2e.command = 'node replay.cjs'; store.saveMeta(meta);
    const task = store.task('task-coverage'); task.tests = ['first.test.yaml', 'second.test.yaml'].map(path => store.lockTest(join(root, path))); store.upsertTask(task);
    const result = run(root, command); assert.equal(result.status, 2, result.stdout + result.stderr);
    const report = command === 'audit' ? last(store, 'audit')?.phase : last(store, 'verification'); assert.ok(report);
    assert.equal(report.executedChecks, 1);
    const check = report.checks.find(check => check.gate === 'e2e-0'); assert.ok(check);
    assert.equal(check.outcome, 'passed'); assert.equal(check.status, 'unknown');
    assert.equal(check.scope, 'command', 'a recovered process outcome must not claim a specification verdict');
    assert.equal(report.freshness, 'unknown'); assert.equal(report.green, false);
    assert.match(result.stdout, /unknown\s+e2e-0/);
    assert.match(result.stdout, /specification result.*(?:unavailable|not established)/i);
    assert.doesNotMatch(result.stdout, /no executable checks ran/);
    const receipt = JSON.parse(fs.readFileSync(join(root, '.chalk/local/verification', report.receiptId, 'run.json'), 'utf8'));
    assert.equal(receipt.browserCommands[0].status, 'pass');
    const first = join(root, '.chalk/runs/first'), runId = fs.readdirSync(first)[0];
    assert.equal(JSON.parse(fs.readFileSync(join(first, runId, 'run.json'), 'utf8')).status, 'failed', 'process success must not masquerade as a specification pass');
  });
}
