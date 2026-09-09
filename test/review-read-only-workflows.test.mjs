import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runReview } from '../lib/review.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t) {
  const top = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-readonly-review-'))), root = join(top, 'app');
  fs.mkdirSync(root); t.after(() => fs.rmSync(top, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root });
  const store = new Store(root), meta = store.meta();
  meta.protocol.review = { command: 'node reviewer.cjs', requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-readonly', title: 'audit reporting', state: 'in-progress', acceptanceCriteria: [{ text: 'exercise an audit' }], tests: [] }; store.upsertTask(task);
  return { top, root, store, task };
}

test('the real reviewer prompt places state-writing Chalk checks in isolated fixtures', t => {
  const { top, root, store, task } = fixture(t), prompt = join(top, 'prompt.txt');
  fs.writeFileSync(join(root, 'reviewer.cjs'), `const fs=require('fs');fs.writeFileSync(${JSON.stringify(prompt)},fs.readFileSync(0));console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  assert.equal(runReview(store, task).verdict, 'pass');
  const text = fs.readFileSync(prompt, 'utf8');
  assert.match(text, /read-only.*including.*\.chalk/s);
  assert.match(text, /Do not run.*verify.*audit.*in this workspace/s);
  assert.match(text, /isolated.*(?:copy|fixture)/s);
  assert.match(text, /supplied.*(?:receipt|evidence)/s);
  assert.match(text, /never.*held-out/i);
});

test('a reviewer running audit in the reviewed workspace is refused with a diagnostic and no automatic retry', t => {
  const { top, root, store, task } = fixture(t), counter = join(top, 'calls.txt');
  fs.writeFileSync(join(root, 'reviewer.cjs'), `const fs=require('fs'),cp=require('child_process');let n=0;try{n=+fs.readFileSync(${JSON.stringify(counter)},'utf8')}catch{}fs.writeFileSync(${JSON.stringify(counter)},String(n+1));cp.execFileSync(process.execPath,[${JSON.stringify(CLI)},'audit'],{stdio:'ignore'});console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  const result = spawnSync(process.execPath, [CLI, 'review', task.id], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /read-only.*changed:/s);
  assert.doesNotMatch(result.stdout + result.stderr, /retrying once/);
  assert.equal(fs.readFileSync(counter, 'utf8'), '1');
  assert.equal((store.task(task.id).reviews || []).length, 0);
  assert.equal(store.task(task.id).state, 'in-progress');
  assert.ok(store.protocol().regression.lastAudit, 'the fixture reproduces the actual audit metadata write');
});
