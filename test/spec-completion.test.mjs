import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store, depsSatisfied, runnableTasks } from '../lib/store.mjs';
import { releasableTasks } from '../lib/release.mjs';
import { completionCurrent } from '../lib/spec-revisions.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
for (const kind of ['criterion', 'test']) {
  test(`${kind} amendments preserve historical completion but gate dependencies and release until revalidation`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-completion-revision-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    ok(root, 'init', '--bare'); fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
    const id = 'task-completed';
    store.upsertTask({ id, title: 'completed parent', state: 'specd', acceptanceCriteria: [{ text: 'original definition' }], tests: [], reviews: [] });
    const child = { id: 'task-child', title: 'dependent child', state: 'specd', acceptanceCriteria: [{ text: 'depends on current acceptance' }], tests: [], after: [id] }; store.upsertTask(child);
    if (kind === 'test') ok(root, 'spec', id, '--test', 'check.cjs');
    ok(root, 'start', id); ok(root, 'review', id, '--note', 'initial contract accepted'); ok(root, 'done', id);
    let parent = store.task(id), originalCompletion = parent.completedSpecRevision;
    assert.ok(completionCurrent(parent)); assert.ok(depsSatisfied(child, store.tasks()));
    assert.deepEqual(releasableTasks(store).map(t => t.id), [id]);
    // Historical side-effect records must survive in history and must not be
    // reused as the PR/release/worktree of the new validation cycle.
    parent.released = '1.0.0'; parent.pr = { number: 7 }; parent.branch = 'old-merged-branch'; parent.pipeline = { stage: 'cleaned' }; store.upsertTask(parent);
    const amendment = kind === 'criterion' ? ['--replace', 'ac-1', '--criterion', 'new definition'] : ['--test', 'check.cjs'];
    ok(root, 'amend-spec', id, ...amendment, '--why', 'contract changed after completion');
    parent = store.task(id);
    assert.equal(parent.state, 'done', 'retain the historical state until explicit restart');
    assert.equal(parent.completedSpecRevision, originalCompletion); assert.ok(parent.completionInvalidated > originalCompletion);
    assert.equal(parent.specRevisions.at(-1).invalidated.completion.released, '1.0.0');
    assert.equal(completionCurrent(parent), false); assert.equal(depsSatisfied(child, store.tasks()), false);
    assert.equal(runnableTasks(store.tasks()).some(t => t.id === child.id), false);
    // Clear only the old release marker in the fixture to prove the completion
    // gate independently excludes this task, rather than relying on !released.
    delete parent.released; store.upsertTask(parent);
    assert.deepEqual(releasableTasks(store), []);
    assert.match(ok(root, 'release', '--dry-run'), /nothing to ship/);
    assert.match(ok(root, 'context', id), /Historical completion does not cover/);
    assert.match(ok(root, 'next'), /Revalidate amended contract/);
    const next = JSON.parse(ok(root, 'next', '--json')); assert.equal(next.task.id, id); assert.equal(next.action, 'start');
    assert.match(ok(root, 'next', '--verbose'), /revalidate amended contract/);
    assert.match(ok(root, 'backlog'), /needs revalidation/); assert.match(ok(root, 'status'), /needs revalidation/);
    ok(root, 'start', id);
    parent = store.task(id); assert.equal(parent.state, 'in-progress'); assert.equal(parent.pr, undefined); assert.equal(parent.branch, undefined); assert.equal(parent.doneAt, undefined);
    assert.notEqual(run(root, 'done', id).status, 0, 'old review cannot accept the new cycle');
    ok(root, 'review', id, '--note', 'amended contract accepted'); ok(root, 'done', id);
    parent = store.task(id); assert.equal(parent.completionInvalidated, undefined); assert.equal(parent.completedSpecRevision, parent.specRevision);
    assert.ok(depsSatisfied(child, store.tasks())); assert.deepEqual(releasableTasks(store).map(t => t.id), [id]);
  });
}

test('legacy completion remains readable; an explicit accepted-revision mismatch cannot satisfy dependencies or release', () => {
  const legacy = { id: 'old', state: 'done' }, dependent = { after: ['old'] };
  assert.ok(completionCurrent(legacy)); assert.ok(depsSatisfied(dependent, [legacy]));
  const mismatch = { ...legacy, specRevision: 2, completedSpecRevision: 1 };
  assert.equal(completionCurrent(mismatch), false); assert.equal(depsSatisfied(dependent, [mismatch]), false);
  assert.deepEqual(releasableTasks({ tasks: () => [mismatch] }), []);
});
