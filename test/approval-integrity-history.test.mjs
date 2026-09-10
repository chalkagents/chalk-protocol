import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store, sha256 } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { checkApproval } from '../lib/approval-inputs.mjs';
import { mergeBlockers } from '../lib/mergegate.mjs';
import { runAudit } from '../lib/regression.mjs';
const CLI = resolve('bin/chalk.mjs');
function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-integrity-history-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root);
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  meta.protocol.review = { requiredAt: [] }; meta.protocol.regression = { command: 'node regression.cjs', tests: [] }; store.saveMeta(meta);
  const task = { id: 'task-current', title: 'chore: fixture', state: 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], pr: { recorded: true } };
  store.upsertTask(task); return { root, parent, store, task };
}

for (const scope of ['active', 'worktree', 'all-locks']) test(`verification admission binds every checked lock (${scope})`, t => {
  const { root, parent, store, task } = fixture(t);
  const cwd = scope === 'worktree' ? join(parent, 'other-worktree') : root;
  fs.mkdirSync(join(cwd, '.chalk'), { recursive: true });
  const lock = join(cwd, '.chalk/visible.cjs'); fs.writeFileSync(lock, 'AAAA');
  store.upsertTask({ id: 'task-other', title: 'other contract', state: scope === 'all-locks' ? 'done' : 'in-progress', worktree: cwd,
    acceptanceCriteria: [{ text: 'other requirement' }], tests: [{ path: '.chalk/visible.cjs', sha256: sha256('AAAA') }] });
  if (scope === 'all-locks') { const meta = store.meta(); meta.protocol.integrity = 'all-locks'; store.saveMeta(meta); }
  const result = verify(store); assert.equal(result.green, true, JSON.stringify(result));
  const record = { approval: result.approvals[task.id] };
  assert.equal(checkApproval(store, 'verification', record, task).current, true);
  assert.deepEqual(mergeBlockers(store, task, { reviewRequired: false, broke: { ok: true, source: 'local', ...record } }), []);
  fs.writeFileSync(lock, 'BBBB');
  const stale = checkApproval(store, 'verification', record, task);
  assert.equal(stale.current, false); assert.match(stale.reason, /chalk verify/);
  assert.match(mergeBlockers(store, task, { reviewRequired: false, broke: { ok: true, source: 'local', ...record } }).join('\n'), /chalk verify/);
  fs.writeFileSync(lock, 'AAAA');
  const hook = join(parent, 'done.mjs');
  fs.writeFileSync(hook, `import fs from 'node:fs';import {Store} from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
const emit=Store.prototype.emitUpdate;Store.prototype.emitUpdate=function(update){if(update.title==='Verification green (done)')fs.writeFileSync(${JSON.stringify(lock)},'BBBB');return emit.call(this,update);};
process.argv=${JSON.stringify([process.execPath, CLI, 'done', task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const done = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  assert.notEqual(done.status, 0, done.stdout + done.stderr); assert.match(done.stdout + done.stderr, /chalk verify/);
  assert.equal(store.task(task.id).state, 'in-progress');
});

for (const change of ['restored-file', 'temporary-file', 'temporary-directory', 'unchanged']) test(`audit observes archived contract authorities (${change})`, t => {
  const { root, store } = fixture(t), dir = join(root, '.chalk/archive'), path = join(dir, 'tasks-2025.json');
  const history = JSON.stringify([{ id: 'task-history', title: 'historical contract', state: 'done', acceptanceCriteria: [{ text: 'must satisfy requirement' }], tests: [] }]);
  if (change !== 'temporary-directory') fs.mkdirSync(dir);
  if (change === 'restored-file' || change === 'unchanged') fs.writeFileSync(path, history);
  const script = change === 'restored-file'
    ? `const before=fs.readFileSync(p);fs.writeFileSync(p,'[]');fs.readFileSync(p);fs.writeFileSync(p,before);`
    : change === 'temporary-file' || change === 'temporary-directory'
      ? `fs.mkdirSync(d,{recursive:true});fs.writeFileSync(p,${JSON.stringify(history)});fs.readFileSync(p);fs.unlinkSync(p);${change === 'temporary-directory' ? 'fs.rmdirSync(d);' : ''}`
      : `fs.readFileSync(p);fs.writeFileSync('.chalk/updates.jsonl','bookkeeping');`;
  fs.writeFileSync(join(root, 'regression.cjs'), `const fs=require('fs'),p=${JSON.stringify(path)},d=${JSON.stringify(dir)};${script}`);
  const result = runAudit(store);
  assert.equal(result.passed, true, 'the configured command itself succeeds');
  assert.equal(result.green, change === 'unchanged', JSON.stringify(result));
  if (change !== 'unchanged') assert.match(result.approvalError, /chalk audit/);
});
