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

for (const command of ['merge', 'work']) test(`${command} publication preserves a BLOCK recorded immediately before its metadata transaction`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-merge-publication-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'), merged = join(parent, 'merged'), injected = join(parent, 'injected'); fs.mkdirSync(root);
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'gh.cjs'), `const a=process.argv.slice(2);if(a.includes('checks'))console.log(JSON.stringify([{bucket:'pass'}]));else if(a.includes('merge'))require('fs').writeFileSync(${JSON.stringify(merged)},'merged');`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.review = { requiredAt: ['per-task'] }; meta.protocol.github = { command: 'node gh.cjs', ciPollAttempts: 0 }; store.saveMeta(meta);
  const task = { id: 'task-publication', title: 'chore: fixture', state: 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], pr: { number: 7, recorded: true }, reviews: [] };
  task.reviews.push({ verdict: 'pass', approval: captureApproval(store, 'review', task) }); store.upsertTask(task);
  const hook = join(parent, 'hook.mjs');
  fs.writeFileSync(hook, `import fs from 'node:fs';import{spawnSync}from'node:child_process';import{Store}from ${JSON.stringify(pathToFileURL(resolve('lib/store.mjs')).href)};
let injected=false;const mutate=Store.prototype.mutateTasks;Store.prototype.mutateTasks=function(...args){if(!injected){injected=true;const r=spawnSync(process.execPath,${JSON.stringify([CLI, 'review', task.id, '--block', '--note', 'late finding'])},{cwd:this.root,encoding:'utf8'});if(r.status!==0)throw Error(r.stdout+r.stderr);fs.writeFileSync(${JSON.stringify(injected)},'injected');}return mutate.apply(this,args);};
process.argv=${JSON.stringify([process.execPath, CLI, command, task.id])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
  const result = spawnSync(process.execPath, [hook], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.existsSync(injected), true, result.stdout + result.stderr);
  if (command === 'merge') { assert.notEqual(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout + result.stderr, /chalk review/); }
  else assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.existsSync(merged), false, 'no remote merge may occur after the BLOCK');
  assert.equal(store.task(task.id).state, 'in-progress'); assert.equal(store.task(task.id).reviews.at(-1).verdict, 'block');
  if (command === 'work') {
    const done = spawnSync(process.execPath, [CLI, 'done', task.id], { cwd: root, encoding: 'utf8' });
    assert.notEqual(done.status, 0, done.stdout + done.stderr); assert.match(done.stdout + done.stderr, /chalk review/);
  }
});
