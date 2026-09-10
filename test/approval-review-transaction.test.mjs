import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
const CLI = resolve('bin/chalk.mjs');

for (const mode of ['manual', 'reviewer', 'run']) test(`${mode} review admission preserves an intervening BLOCK`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-review-transaction-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'), marker = join(parent, 'injected'); fs.mkdirSync(root);
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({verdict:process.env.CHALK_TEST_REVIEW_BLOCK?'block':'pass',findings:[]})));`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  meta.protocol.executor = { command: 'node check.cjs' }; meta.protocol.review = { requiredAt: ['per-task'], ...(mode === 'manual' ? {} : { command: 'node review.cjs' }) }; store.saveMeta(meta);
  const task = { id: 'task-review-race', title: 'chore: fixture', state: mode === 'run' ? 'specd' : 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], reviews: [] }; store.upsertTask(task);
  const hook = join(parent, 'hook.mjs');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{spawnSync}from'node:child_process';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let injected=false;const upsert=Store.prototype.upsertTask;Store.prototype.upsertTask=function(task,...rest){if(!injected&&task.reviews?.at(-1)?.verdict==='pass'){injected=true;const r=spawnSync(process.execPath,${JSON.stringify([CLI, 'review', task.id, '--block', '--note', 'late finding'])},{cwd:this.root,encoding:'utf8',env:{...process.env,CHALK_TEST_REVIEW_BLOCK:'1'}});if(r.status!==${mode === 'manual' ? 0 : 3})throw Error(r.stdout+r.stderr);fs.writeFileSync(${JSON.stringify(marker)},'injected');}return upsert.call(this,task,...rest);};
process.argv=${JSON.stringify([process.execPath, CLI, ...(mode === 'run' ? ['run', '--max', '1'] : ['review', task.id, '--note', 'reviewed'])])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.existsSync(marker), true, result.stdout + result.stderr);
  const current = store.task(task.id); assert.equal(current.reviews.length, 1); assert.equal(current.reviews[0].verdict, 'block'); assert.notEqual(current.state, 'done');
  if (mode === 'run') { assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(current.state, 'blocked'); assert.match(current.block.reason, /review history changed.*chalk review/); }
  else { assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /review history changed.*chalk review/); }
});
