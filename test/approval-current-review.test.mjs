import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { captureApproval, currentReview } from '../lib/approval-inputs.mjs';
const CLI = resolve('bin/chalk.mjs');

for (const verdict of ['block', 'pass']) test(`done consults and preserves the latest stored ${verdict} after verification`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-current-review-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root);
  const initialized = spawnSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-current', title: 'chore: fixture', state: 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], reviews: [] };
  task.reviews.push({ verdict: 'pass', approval: captureApproval(store, 'review', task) }); store.upsertTask(task);
  const hook = join(parent, 'done.mjs');
  fs.writeFileSync(hook, `import {Store} from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
import {captureApproval} from ${JSON.stringify(pathToFileURL(resolve('lib/approval-inputs.mjs')).href)};
const emit=Store.prototype.emitUpdate;Store.prototype.emitUpdate=function(update){
if(update.title==='Verification green (done)'){const task=this.task('task-current');task.reviews.push({verdict:${JSON.stringify(verdict)},approval:captureApproval(this,'review',task)});this.upsertTask(task);}
return emit.call(this,update);};process.argv=${JSON.stringify([process.execPath, CLI, 'done', task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  if (verdict === 'block') {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /chalk review/);
    assert.equal(store.task(task.id).state, 'in-progress');
    assert.equal(currentReview(store, task), false, 'an old passing snapshot cannot override the current BLOCK');
  } else {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(store.task(task.id).state, 'done');
  }
  assert.equal(store.task(task.id).reviews.length, 2, 'completion must preserve the newly recorded verdict');
});
