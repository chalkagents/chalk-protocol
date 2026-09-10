import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store, sha256 } from '../lib/store.mjs';
import { auditApprovalCurrent } from '../lib/audit-specification.mjs';
const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
function fixture(t, worktree = false) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-approval-findings-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root); ok(root, 'init', '--bare');
  const cwd = worktree ? join(parent, 'worktree') : root;
  if (worktree) fs.mkdirSync(cwd);
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  if (worktree) fs.copyFileSync(join(root, 'check.cjs'), join(cwd, 'check.cjs'));
  const store = new Store(root), id = 'task-findings', meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  meta.protocol.review = { requiredAt: [] }; meta.protocol.regression = { required: true, command: '', tests: [], locPerTest: 1e9 }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'chore: fixture', state: 'in-progress', worktree: worktree ? cwd : undefined, acceptanceCriteria: [{ text: 'current requirement' }], tests: [], reviews: [] });
  return { root, cwd, store, id };
}

for (const scope of ['active', 'all-locks', 'worktree']) test(`audit binds visible integrity inputs excluded from its source manifest (${scope})`, t => {
  const { root, cwd, store, id } = fixture(t, scope === 'worktree');
  fs.mkdirSync(join(cwd, '.chalk'), { recursive: true });
  fs.writeFileSync(join(cwd, '.chalk/visible-input.cjs'), 'AAAA');
  const task = store.task(id); task.tests = [{ path: '.chalk/visible-input.cjs', sha256: sha256('AAAA') }];
  if (scope === 'all-locks') { task.state = 'done'; const meta = store.meta(); meta.protocol.integrity = 'all-locks'; store.saveMeta(meta); }
  store.upsertTask(task); ok(root, 'audit'); assert.equal(auditApprovalCurrent(store), true);
  fs.writeFileSync(join(cwd, '.chalk/visible-input.cjs'), 'BBBB');
  assert.equal(auditApprovalCurrent(store), false, 'same-size edits to checked visible locks must invalidate the audit');
  const phase = run(root, 'phase', 'delivery'); assert.notEqual(phase.status, 0); assert.match(phase.stdout + phase.stderr, /chalk audit/);
  assert.notEqual(run(root, 'audit').status, 0, 'renewal still checks lock integrity');
});

for (const scope of ['present', 'absent', 'worktree']) test(`done rejects a temporarily changed and restored project specification (${scope})`, t => {
  const { root, cwd, store, id } = fixture(t, scope === 'worktree');
  const spec = join(root, '.chalk/spec.md'); if (scope === 'absent') fs.rmSync(spec);
  fs.writeFileSync(join(cwd, 'check.cjs'), `const fs=require('fs'),p=${JSON.stringify(spec)},existed=fs.existsSync(p),before=existed?fs.readFileSync(p):null;fs.writeFileSync(p,'temporary contract');if(existed)fs.writeFileSync(p,before);else fs.unlinkSync(p);`);
  const result = run(root, 'done', id); assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /chalk verify/); assert.equal(store.task(id).state, 'in-progress');
});

test('automated review retains detected input-change diagnostics and the recovery command in its handoff', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{const fs=require('fs'),p='.chalk/spec.md',before=fs.readFileSync(p);fs.writeFileSync(p,'temporary contract');fs.writeFileSync(p,before);console.log(JSON.stringify({verdict:'pass',findings:[]}));});`);
  const meta = store.meta(); meta.protocol.executor = { command: 'node check.cjs' }; meta.protocol.review = { command: 'node review.cjs', requiredAt: ['per-task'] }; store.saveMeta(meta);
  const queued = store.task(id); queued.state = 'specd'; store.upsertTask(queued);
  ok(root, 'run', '--max', '1'); const task = store.task(id);
  assert.equal(task.state, 'blocked'); assert.equal(task.reviews.length, 0);
  assert.match(task.block.reason, /specification changed during review/);
  assert.match(task.block.reason, /chalk review task-findings/);
  const handoff = fs.readFileSync(join(root, task.handoff.path), 'utf8');
  assert.match(handoff, /specification changed during review/); assert.match(handoff, /chalk review task-findings/);
});
