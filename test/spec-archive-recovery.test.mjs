import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { archivedTasks, runArchive } from '../lib/archive.mjs';
import { auditApprovalCurrent, auditSpecificationDigest } from '../lib/audit-specification.mjs';
const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const ok = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
for (const previousYear of [false, true]) {
  test(`interrupted archive retry retains the newer contract and cannot revive its old audit (previousYear=${previousYear})`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-archive-recovery-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    ok(root, 'init', '--bare'); fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const store = new Store(root), meta = store.meta(), id = 'task-archive';
    meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    store.upsertTask({ id, title: 'archival contract', state: 'done', released: '1.0.0', acceptanceCriteria: [{ text: 'old contract' }], tests: [] });
    const audit = { green: true, specificationDigest: auditSpecificationDigest(store) };
    const fault = join(root, 'interrupt.mjs');
    fs.writeFileSync(fault, `import {Store} from ${JSON.stringify(STORE)};const save=Store.prototype.saveTasks;Store.prototype.saveTasks=function(tasks){if(!tasks.some(t=>t.id===${JSON.stringify(id)}))throw new Error('interrupt before live-task removal');return save.call(this,tasks);};`);
    const failed = spawnSync(process.execPath, ['--import', pathToFileURL(fault).href, CLI, 'archive'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(failed.status, 0); assert.match(failed.stdout + failed.stderr, /interrupt before live-task removal/);
    assert.ok(store.task(id)); assert.equal(archivedTasks(store).length, 1);
    if (previousYear) {
      const dir = join(root, '.chalk/archive'); const file = fs.readdirSync(dir).find(name => /^tasks-\d{4}\.json$/.test(name));
      fs.renameSync(join(dir, file), join(dir, `tasks-${Number(file.slice(6, 10)) - 1}.json`));
    }
    ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'new contract', '--why', 'change after interrupted archival');
    ok(root, 'start', id); ok(root, 'done', id); ok(root, 'release', '--no-tag', '--version', '1.1.0');
    assert.equal(auditApprovalCurrent(store, audit), false);
    const current = store.task(id), digest = auditSpecificationDigest(store);
    ok(root, 'archive'); assert.equal(store.task(id), undefined);
    const archived = archivedTasks(store); assert.equal(archived.length, 1); assert.equal(archived[0].specRevision, current.specRevision);
    assert.deepEqual(archived[0].specRevisions, current.specRevisions); assert.deepEqual(archived[0].acceptanceCriteria, current.acceptanceCriteria);
    assert.equal(auditSpecificationDigest(store), digest); assert.equal(auditApprovalCurrent(store, audit), false);
  });
}
test('archive refuses to discard a live task when archived history has a higher revision', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-archive-newer-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare'); const store = new Store(root), task = { id: 'task-conflict', title: 'conflict', state: 'done', released: '1.0', specRevision: 1, acceptanceCriteria: [{ text: 'one' }], tests: [] }; store.upsertTask(task);
  const dir = join(root, '.chalk/archive'); fs.mkdirSync(dir); fs.writeFileSync(join(dir, 'tasks-2020.json'), JSON.stringify([{ ...task, specRevision: 2 }]));
  assert.throws(() => runArchive(store), /newer specification/); assert.equal(store.task(task.id).specRevision, 1); assert.equal(archivedTasks(store)[0].specRevision, 2);
});
