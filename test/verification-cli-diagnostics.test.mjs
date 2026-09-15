import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t, code = 'console.log("verified")') {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-cli-evidence-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root });
  fs.writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { required: false }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-diagnostic', title: 'diagnostic', state: 'in-progress', acceptanceCriteria: [{ text: 'retain evidence' }], tests: [] });
  return { root, store };
}
function run(root, command) {
  return spawnSync(process.execPath, [CLI, command, ...(command === 'done' ? ['task-diagnostic'] : [])],
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

for (const command of ['verify', 'done']) {
  test(`${command} prints the path of its successful persisted receipt`, t => {
    const { root } = fixture(t), result = run(root, command);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const path = result.stdout.match(/verification record: ([^\r\n]+)/)?.[1];
    assert.ok(path, result.stdout + result.stderr);
    const receipt = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert.equal(receipt.cwd, root); assert.equal(receipt.green, true);
    assert.equal(receipt.toolchain.find(g => g.gate === 'test').cmd, 'node check.cjs');
  });

  test(`${command} explains stale source inputs and preserves the incomplete task`, t => {
    const { root, store } = fixture(t, 'require("fs").writeFileSync("source.js","changed");');
    fs.writeFileSync(join(root, 'source.js'), 'before');
    const result = run(root, command), output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /verification inputs (?:are )?stale/);
    assert.match(output, /source changes.*re-run chalk verify/);
    assert.match(output, /verification record: /);
    assert.equal(store.task('task-diagnostic').state, 'in-progress');
  });

  test(`${command} explains evidence-storage failure and keeps the task incomplete`, t => {
    const { root, store } = fixture(t), local = join(root, '.chalk/local');
    fs.rmSync(local, { recursive: true, force: true }); fs.writeFileSync(local, 'not a directory');
    const result = run(root, command), output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, command === 'verify' ? /evidence error:/ : /verification evidence could not be saved:/);
    assert.match(output, /ENOTDIR|EEXIST/);
    assert.match(output, /verification inputs (?:are )?unknown/);
    assert.equal(store.task('task-diagnostic').state, 'in-progress');
  });
}
