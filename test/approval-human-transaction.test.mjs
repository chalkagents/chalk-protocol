import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { captureApproval } from '../lib/approval-inputs.mjs';
const CLI = resolve('bin/chalk.mjs');

function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-human-transaction-'))), root = join(parent, 'project');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true })); fs.mkdirSync(root);
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-human-race', title: 'chore: fixture', state: 'in-progress', plan: 'implement the contract', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], reviews: [] };
  task.reviews.push({ verdict: 'pass', approval: captureApproval(store, 'review', task) }); store.upsertTask(task);
  return { parent, root, store, task };
}

for (const command of ['align', 'approve-plan']) for (const mode of ['block', 'contract']) test(`${command} transaction preserves concurrent ${mode}`, t => {
  const { parent, root, store, task } = fixture(t), hook = join(parent, 'hook.mjs'), marker = join(parent, 'injected');
  const field = command === 'align' ? 'criteriaAccepted' : 'planApproved';
  const concurrent = mode === 'block' ? ['review', task.id, '--block', '--note', 'late finding'] : ['amend-spec', task.id, '--add', 'new current requirement', '--why', 'concurrent contract change'];
  fs.writeFileSync(hook, `import fs from 'node:fs';import{spawnSync}from'node:child_process';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let injected=false;const upsert=Store.prototype.upsertTask;Store.prototype.upsertTask=function(task,...rest){if(!injected&&task[${JSON.stringify(field)}]){injected=true;const r=spawnSync(process.execPath,${JSON.stringify([CLI, ...concurrent])},{cwd:this.root,encoding:'utf8'});if(r.status!==0)throw Error(r.stdout+r.stderr);fs.writeFileSync(${JSON.stringify(marker)},'injected');}return upsert.call(this,task,...rest);};
process.argv=${JSON.stringify([process.execPath, CLI, command, task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.existsSync(marker), true, result.stdout + result.stderr);
  const current = store.task(task.id);
  if (mode === 'block') {
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.ok(current[field]);
    assert.equal(current.reviews.length, 2); assert.equal(current.reviews.at(-1).verdict, 'block');
    const done = spawnSync(process.execPath, [CLI, 'done', task.id], { cwd: root, encoding: 'utf8' });
    assert.notEqual(done.status, 0); assert.match(done.stdout + done.stderr, /chalk review/); assert.notEqual(store.task(task.id).state, 'done');
  } else {
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /stale.*chalk/);
    assert.equal(current[field], undefined); assert.equal(current.specRevision, 1); assert.equal(current.acceptanceCriteria.length, 2);
  }
});

for (const mode of ['overwrite', 'stale-append']) test(`whole-task ${mode} cannot erase recorded review history`, t => {
  const { store, task } = fixture(t), stale = store.task(task.id), current = store.task(task.id);
  current.reviews.push({ verdict: 'block', note: 'new blocking finding' }); store.upsertTask(current);
  stale.plan = 'new plan'; if (mode === 'stale-append') stale.reviews.push({ verdict: 'pass', note: 'older parallel review' });
  assert.throws(() => store.upsertTask(stale), /review history changed.*chalk review/);
  assert.equal(store.task(task.id).reviews.at(-1).verdict, 'block'); assert.equal(store.task(task.id).plan, task.plan);
});
