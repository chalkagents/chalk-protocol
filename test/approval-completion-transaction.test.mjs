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

for (const command of ['done', 'run']) test(`${command} admits the latest review inside its completion transaction`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-completion-transaction-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root);
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({verdict:process.env.CHALK_TEST_REVIEW_BLOCK?'block':'pass',findings:[]})));`);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  meta.protocol.executor = { command: 'node check.cjs' };
  meta.protocol.review = { command: 'node review.cjs', requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-transaction', title: 'chore: fixture', state: command === 'done' ? 'in-progress' : 'specd', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], reviews: [] };
  task.reviews.push({ verdict: 'pass', approval: captureApproval(store, 'review', task) }); store.upsertTask(task);
  const hook = join(parent, 'hook.mjs'), marker = join(parent, 'injected');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{spawnSync}from'node:child_process';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let armed=false,injected=false;const emit=Store.prototype.emitUpdate,upsert=Store.prototype.upsertTask,mutate=Store.prototype.mutateTasks;
Store.prototype.emitUpdate=function(u){const r=emit.call(this,u);if(u.title==='Verification green (done)')armed=true;return r;};
Store.prototype.upsertTask=function(t){const r=upsert.call(this,t);if(${JSON.stringify(command)}==='run'&&t.reviews?.at(-1)?.by==='adversary')armed=true;return r;};
Store.prototype.mutateTasks=function(...args){if(armed&&!injected){injected=true;const r=spawnSync(process.execPath,${JSON.stringify([CLI, 'review', task.id])},{cwd:this.root,encoding:'utf8',env:{...process.env,CHALK_TEST_REVIEW_BLOCK:'1'}});if(r.status!==3)throw Error(r.stdout+r.stderr);fs.writeFileSync(${JSON.stringify(marker)},'injected');}return mutate.apply(this,args);};
process.argv=${JSON.stringify([process.execPath, CLI, command, ...(command === 'done' ? [task.id] : ['--max', '1'])])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.existsSync(marker), true, result.stdout + result.stderr);
  const current = store.task(task.id);
  assert.equal(current.reviews.at(-1).verdict, 'block', 'the completion write must preserve the concurrent review');
  assert.notEqual(current.state, 'done', result.stdout + result.stderr);
  if (command === 'done') { assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /chalk review/); }
  else { assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(current.state, 'blocked'); assert.match(current.block.reason, /chalk review/); }
});
