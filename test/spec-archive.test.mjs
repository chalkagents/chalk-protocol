import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { archivedTasks, runArchive } from '../lib/archive.mjs';

const CLI = resolve('bin/chalk.mjs');
const ok = (cwd, ...args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
};
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-spec-archive-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare'); fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-shipped', title: 'shipped contract', state: 'done', released: '1.0.0', acceptanceCriteria: [{ text: 'old contract' }], tests: [] });
  return { root, store, id: 'task-shipped' };
}
for (const kind of ['criterion', 'test']) {
  test(`${kind} amendment keeps a released task live through archive and permits revalidation`, t => {
    const { root, store, id } = fixture(t);
    const args = kind === 'criterion' ? ['--replace', 'ac-1', '--criterion', 'new contract'] : ['--test', 'check.cjs'];
    ok(root, 'amend-spec', id, ...args, '--why', 'accept a changed contract');
    assert.match(ok(root, 'archive', '--dry-run'), /nothing to move/);
    assert.match(ok(root, 'archive'), /nothing to move/);
    assert.ok(store.task(id)?.completionInvalidated);
    assert.equal(archivedTasks(store).length, 0);
    ok(root, 'start', id); ok(root, 'done', id);
    assert.equal(store.task(id).completedSpecRevision, store.task(id).specRevision);
    // Simulate a later release marker; only fresh accepted completion is eligible.
    const completed = store.task(id); completed.released = '1.0.1'; store.upsertTask(completed);
    assert.match(ok(root, 'archive'), /archived 1 task/);
    assert.equal(store.task(id), undefined);
    assert.equal(archivedTasks(store)[0].completedSpecRevision, completed.specRevision);
  });
}
test('archive selects eligible tasks only after acquiring the amendment lock', t => {
  const { root, store, id } = fixture(t);
  const withLock = store.withLock.bind(store);
  store.withLock = (fn, options) => {
    ok(root, 'amend-spec', id, '--add', 'arrives before archive admission', '--why', 'serialize archive with revisions');
    return withLock(() => {
      assert.ok(fs.existsSync(join(root, '.chalk/.lock/owner')));
      return fn();
    }, options);
  };
  const result = runArchive(store);
  assert.deepEqual(result.archived, []);
  assert.ok(store.task(id)?.completionInvalidated);
  assert.equal(archivedTasks(store).length, 0);
});

test('amended completion is pending in board, plan, portal and acceptance statistics', async t => {
  const { root, store, id } = fixture(t);
  const { projectBoard } = await import('../lib/boards.mjs');
  const { projectPlans } = await import('../lib/plans.mjs');
  const { portalModel } = await import('../lib/portal.mjs');
  const { computeStats } = await import('../lib/stats.mjs');
  const task = store.task(id); task.milestone = 'ship'; store.upsertTask(task);
  ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'new visible behavior', '--why', 'update delivered contract');
  const board = projectBoard(store);
  const card = JSON.parse(fs.readFileSync(board.file, 'utf8')).cards[0];
  assert.equal(card.column, 'todo'); assert.notEqual(card.testArtifact?.lastRun?.status, 'passed');
  assert.match(card.description, /needs revalidation/);
  const plans = projectPlans(store); assert.equal(plans.written[0].column, 'todo');
  const plan = fs.readFileSync(join(plans.plansDir, 'todo', plans.written[0].filename), 'utf8');
  assert.match(plan, /status: pending/); assert.doesNotMatch(plan, /status: done/);
  assert.match(plan, /Current contract needs revalidation/);
  const portal = portalModel(store); assert.equal(portal.scope[0].state, 'defined');
  assert.equal(portal.scope[0].verify, undefined); assert.equal(portal.milestones[0].status, 'pending');
  assert.equal(computeStats(store).tasks.done, 0);
  ok(root, 'start', id); ok(root, 'done', id);
  const refreshed = projectBoard(store);
  assert.equal(JSON.parse(fs.readFileSync(refreshed.file, 'utf8')).cards[0].column, 'done');
  assert.equal(projectPlans(store).written[0].column, 'done');
  assert.equal(portalModel(store).scope[0].state, 'delivered');
  assert.equal(computeStats(store).tasks.done, 1);
});
