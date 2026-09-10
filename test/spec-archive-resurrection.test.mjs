import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { archivedTasks } from '../lib/archive.mjs';
import { auditApprovalCurrent, auditSpecificationDigest } from '../lib/audit-specification.mjs';
import { releasableTasks } from '../lib/release.mjs';
import { checkReleaseRecovery } from '../lib/release-admission.mjs';
const CLI = resolve('bin/chalk.mjs');
const ok = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };

test('a returning planner cannot resurrect an archived contract or its old approvals', t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-archive-resurrection-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'main'), worktree = join(parent, 'planner'); fs.mkdirSync(root); fs.mkdirSync(worktree); ok(root, 'init', '--bare');
  const store = new Store(root), id = 'task-planner';
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const commands = [['amend-spec', id, '--add', 'new contract', '--why', 'concurrent lifecycle'], ['start', id], ['done', id], ['release', '--no-tag', '--version', '1.1.0'], ['archive']];
  fs.writeFileSync(join(worktree, 'planner.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{for(const args of ${JSON.stringify(commands)})require('child_process').execFileSync(process.execPath,[${JSON.stringify(CLI)},...args],{cwd:${JSON.stringify(root)},stdio:'pipe'});console.log('# Plan\\nPlan for the old contract');});`);
  const meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: [] }; meta.protocol.planner = { command: 'node planner.cjs' }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'planner race', state: 'done', doneAt: '2020-01-01T00:00:00Z', released: '1.0.0', worktree, acceptanceCriteria: [{ text: 'old contract' }], tests: [], criteriaAccepted: { at: 'old' }, planApproved: { at: 'old' }, reviews: [{ verdict: 'pass', at: 'old' }] });
  const old = store.task(id), audit = { green: true, specificationDigest: auditSpecificationDigest(store) };
  const plan = spawnSync(process.execPath, [CLI, 'plan', id], { cwd: root, encoding: 'utf8' });
  assert.notEqual(plan.status, 0); assert.match(plan.stdout + plan.stderr, /task was archived.*cannot resurrect/);
  assert.equal(store.task(id), undefined); const archived = archivedTasks(store)[0];
  assert.equal(archived.specRevision, 1); assert.equal(archived.released, '1.1.0'); assert.equal(archived.specRevisions.length, 1);
  assert.equal(auditApprovalCurrent(store, audit), false); assert.equal(releasableTasks(store).length, 0);
  assert.throws(() => store.upsertTask(old), /cannot resurrect/);
  assert.throws(() => store.upsertTask(archived), /cannot resurrect/, 'even a matching archived ID requires an explicit restoration workflow');
});

for (const conflict of ['older', 'same-revision', 'unreadable']) {
  test(`audit and release fail closed on ${conflict} archive authority`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-archive-conflict-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true })); ok(root, 'init', '--bare');
    const store = new Store(root), task = { id: 'task-conflict', title: 'conflict', state: 'done', specRevision: 1, acceptanceCriteria: [{ text: 'live' }], tests: [] }; store.upsertTask(task);
    const dir = join(root, '.chalk/archive'); fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'tasks-2020.json'), conflict === 'unreadable' ? '{' : JSON.stringify([{ ...task, specRevision: conflict === 'older' ? 2 : 1, acceptanceCriteria: [{ text: 'archived' }] }]));
    const error = conflict === 'unreadable' ? /history is unreadable/ : /conflicting live\/archive/;
    assert.throws(() => auditSpecificationDigest(store), error);
    assert.equal(auditApprovalCurrent(store, { green: true }), false, 'unidentified legacy audit never opens the gate');
    assert.throws(() => releasableTasks(store), error);
    assert.throws(() => checkReleaseRecovery(store, '1.0.0'), error);
    if (conflict === 'unreadable') assert.throws(() => store.upsertTask({ ...task, id: 'new-task' }), error);
  });
}
