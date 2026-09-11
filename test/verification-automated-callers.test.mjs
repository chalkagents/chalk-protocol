import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs');

function fixture(t, command, check = 'console.log("verified")') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `chalk-${command}-receipt-`)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), check);
  writeFileSync(join(root, 'executor.cjs'), 'process.stdin.resume();');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.review = { required: false, requiredAt: [] };
  meta.protocol.executor.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'executor.cjs'))}`;
  store.saveMeta(meta);
  store.upsertTask({
    id: 'task-automated', title: 'chore: automated receipt',
    state: command === 'work' ? 'in-progress' : 'specd', branchType: 'chore',
    acceptanceCriteria: [{ text: 'automated verification is recorded' }], tests: [], reviews: [],
  });
  return { root, store };
}

function invoke(root, command) {
  const args = command === 'work' ? ['work', 'task-automated'] : ['run', '--max', '1', '--until', 'blocked'];
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

function receipts(root) {
  const dir = join(root, '.chalk/local/verification');
  return readdirSync(dir).map(name => JSON.parse(readFileSync(join(dir, name, 'run.json'), 'utf8')));
}

for (const command of ['work', 'run']) {
  test(`chalk ${command} creates a fresh source-bound verification receipt`, t => {
    const { root, store } = fixture(t, command);
    const result = invoke(root, command);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const records = receipts(root);
    assert.equal(records.length, 1);
    assert.equal(records[0].green, true);
    assert.equal(records[0].freshness, 'fresh');
    assert.equal(records[0].before.tasks[0].id, 'task-automated');
    assert.equal(records[0].toolchain.find(gate => gate.gate === 'test').cmd, 'node check.cjs');
    const task = store.task('task-automated');
    if (command === 'work') assert.equal(task.pipeline.stage, 'verified');
    else assert.equal(task.state, 'done');
  });

  test(`chalk ${command} cannot advance on stale recorded inputs`, t => {
    const { root, store } = fixture(t, command,
      'require("node:fs").writeFileSync("source.js", "changed");');
    writeFileSync(join(root, 'source.js'), 'before');
    const result = invoke(root, command);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    const records = receipts(root);
    assert.equal(records.length, 1);
    assert.equal(records[0].green, false);
    assert.equal(records[0].freshness, 'stale');
    const task = store.task('task-automated');
    if (command === 'work') assert.notEqual(task.pipeline?.stage, 'verified');
    else assert.equal(task.state, 'blocked');
  });
}
