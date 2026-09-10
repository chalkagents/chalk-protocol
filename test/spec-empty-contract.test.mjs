import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-empty-contract-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); ok(root, 'init', '--bare');
  return { root, store: new Store(root) };
}

test('retiring the last criterion of an unstarted task cannot leave a runnable empty contract', t => {
  const { root, store } = fixture(t);
  ok(root, 'task', 'add', 'feat: unstarted requirement'); const id = store.tasks()[0].id;
  ok(root, 'spec', id, '--criterion', 'implement behavior'); const before = store.task(id);
  assert.equal(before.state, 'specd'); assert.equal(before.startedAt, undefined);
  const retired = run(root, 'amend-spec', id, '--retire', 'ac-1', '--why', 'remove sole criterion');
  assert.notEqual(retired.status, 0); assert.match(retired.stdout + retired.stderr, /retain a criterion or locked test/);
  assert.deepEqual(store.task(id), before, 'refusal is atomic and retains the contract');
});

test('run blocks legacy empty specd tasks before execution and continues with valid work', t => {
  const { root, store } = fixture(t), meta = store.meta();
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'executor.cjs'), `require('fs').appendFileSync('executions.txt','executed\\n');require('fs').writeFileSync('feature.js','export const ready = true;');console.log('implemented');`);
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = true;
  meta.protocol.executor = { command: 'node executor.cjs' }; meta.protocol.review = { requiredAt: [] }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-empty', title: 'feat: empty legacy contract', state: 'specd', acceptanceCriteria: [], tests: [] });
  store.upsertTask({ id: 'task-valid', title: 'chore: valid contract', state: 'specd', acceptanceCriteria: [{ text: 'implement the valid task' }], tests: [] });
  ok(root, 'run', '--max', '2');
  const empty = store.task('task-empty'); assert.equal(empty.state, 'blocked'); assert.match(empty.block.reason, /GATE P1/);
  assert.equal(empty.attempts, undefined); assert.equal(empty.startedAt, undefined); assert.equal(empty.doneAt, undefined);
  assert.equal(store.task('task-valid').state, 'done'); assert.equal(fs.readFileSync(join(root, 'executions.txt'), 'utf8'), 'executed\n');
});
