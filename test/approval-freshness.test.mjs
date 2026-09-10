import { candidateGh } from '../scripts/test-gh-candidate.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store, sha256 } from '../lib/store.mjs';
import { captureApproval, checkApproval, currentReview } from '../lib/approval-inputs.mjs';
const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-approval-freshness-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); ok(root, 'init', '--bare');
  const store = new Store(root), id = 'task-current';
  fs.writeFileSync(join(root, 'source.cjs'), 'module.exports = 1;\n');
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: ['per-task'] }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'chore: current contract', state: 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [], plan: 'Implement the requirement', reviews: [] });
  return { root, store, id };
}

test('approval input scopes invalidate relevant changes and ignore routine bookkeeping', t => {
  const { root, store, id } = fixture(t), task = store.task(id);
  const kinds = ['alignment', 'plan', 'review', 'audit', 'verification'];
  const records = Object.fromEntries(kinds.map(kind => [kind, { approval: captureApproval(store, kind, kind === 'audit' ? undefined : task) }]));
  for (const kind of kinds) assert.equal(checkApproval(store, kind, records[kind], kind === 'audit' ? undefined : task).current, true, kind);
  ok(root, 'update', 'bookkeeping'); ok(root, 'decision', 'fixture note', '--why', 'bookkeeping');
  for (const kind of kinds) assert.equal(checkApproval(store, kind, records[kind], kind === 'audit' ? undefined : task).current, true, kind);
  fs.writeFileSync(join(root, 'source.cjs'), 'module.exports = 2;\n');
  for (const kind of ['review', 'audit', 'verification']) assert.equal(checkApproval(store, kind, records[kind], kind === 'audit' ? undefined : task).current, false, kind);
  for (const kind of ['alignment', 'plan']) assert.equal(checkApproval(store, kind, records[kind], task).current, true, `${kind} must survive implementation edits`);
  const changed = store.task(id); changed.plan = 'A different plan'; store.upsertTask(changed);
  assert.equal(checkApproval(store, 'plan', records.plan, changed).current, false);
  assert.equal(checkApproval(store, 'alignment', records.alignment, changed).current, true);
  fs.appendFileSync(join(root, '.chalk/spec.md'), '\nChanged project specification.\n');
  assert.equal(checkApproval(store, 'alignment', records.alignment, changed).current, false);
});

test('same-size source and gate configuration changes invalidate a real audit before phase admission', t => {
  const { root, store } = fixture(t), meta = store.meta();
  meta.protocol.regression = { required: true, command: '', tests: [], locPerTest: 1e9 }; meta.protocol.review = { requiredAt: [] }; store.saveMeta(meta);
  ok(root, 'audit'); ok(root, 'phase', 'delivery');
  fs.writeFileSync(join(root, 'source.cjs'), 'module.exports = 2;\n');
  let denied = run(root, 'phase', 'maintenance'); assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /chalk audit/);
  ok(root, 'audit'); const changed = store.meta(); changed.protocol.verify.test = 'node check.cjs --different'; store.saveMeta(changed);
  denied = run(root, 'phase', 'maintenance'); assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /chalk audit/);
  ok(root, 'audit'); ok(root, 'phase', 'maintenance');
});

test('done refuses a source-stale review after fresh verification; renewed review recovers', t => {
  const { root, store, id } = fixture(t); ok(root, 'review', id, '--note', 'reviewed initial implementation');
  assert.equal(currentReview(store, store.task(id)), true);
  fs.writeFileSync(join(root, 'source.cjs'), 'module.exports = 2;\n');
  const denied = run(root, 'done', id); assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /chalk review/);
  assert.equal(store.task(id).state, 'in-progress');
  ok(root, 'review', id, '--note', 'reviewed corrected implementation'); ok(root, 'done', id);
  assert.equal(store.task(id).state, 'done');
});

test('legacy human, review and audit records remain historical until their commands renew them', t => {
  const { root, store, id } = fixture(t), task = store.task(id), meta = store.meta();
  meta.protocol.plan = { required: true }; meta.protocol.director = { required: true };
  meta.protocol.regression = { required: true, command: '', tests: [], locPerTest: 1e9, lastAudit: { green: true } }; store.saveMeta(meta);
  task.planApproved = { at: 'old' }; task.criteriaAccepted = { at: 'old' }; task.reviews = [{ verdict: 'pass', at: 'old' }]; store.upsertTask(task);
  for (const [kind, record] of [['plan', task.planApproved], ['alignment', task.criteriaAccepted], ['review', task.reviews[0]], ['audit', meta.protocol.regression.lastAudit]]) {
    const checked = checkApproval(store, kind, record, kind === 'audit' ? undefined : task); assert.equal(checked.current, false); assert.match(checked.reason, /historical.*chalk/);
  }
  assert.notEqual(run(root, 'done', id).status, 0); assert.notEqual(run(root, 'phase', 'delivery').status, 0);
  ok(root, 'approve-plan', id); ok(root, 'align', id); ok(root, 'review', id, '--note', 'renewed review'); ok(root, 'done', id);
  ok(root, 'audit'); ok(root, 'phase', 'delivery');
});

test('unchanged verify, review and done accept bookkeeping and reuse validated execution', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'check.cjs'), `require('fs').appendFileSync('.chalk/check-count','run\\n');console.log('checked');`);
  fs.writeFileSync(join(root, '.chalk/check-count'), '');
  ok(root, 'verify'); ok(root, 'review', id, '--note', 'review complete'); ok(root, 'update', 'ready for done'); ok(root, 'done', id);
  assert.equal(store.task(id).state, 'done'); assert.equal(fs.readFileSync(join(root, '.chalk/check-count'), 'utf8'), 'run\n');
});

test('merge rejects a review made stale while CI is queried, even when new local verification passes', t => {
  const { root, store, id } = fixture(t), outside = fs.mkdtempSync(join(tmpdir(), 'chalk-merge-observations-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const changed = join(outside, 'changed'), merged = join(outside, 'merged');
  fs.writeFileSync(join(root, 'gh.cjs'), candidateGh(`const fs=require('fs'),a=process.argv.slice(2);if(a.includes('checks')){if(!fs.existsSync(${JSON.stringify(changed)})){fs.writeFileSync('source.cjs','module.exports = 2;\\n');fs.writeFileSync(${JSON.stringify(changed)},'changed')}console.log('[{"bucket":"pass"}]')}if(a.includes('merge'))fs.writeFileSync(${JSON.stringify(merged)},'merged');process.stdin.resume();`, { commonjs: true }));
  const meta = store.meta(); meta.protocol.github = { command: 'node gh.cjs', base: 'main', ciPollAttempts: 0 }; store.saveMeta(meta);
  const task = store.task(id); task.pr = { number: 7, recorded: true }; store.upsertTask(task);
  for (const args of [['init', '-b', 'main'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-m', 'initial']]) execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const remote = join(outside, 'remote'); fs.mkdirSync(remote);
  execFileSync('git', ['init', '--bare', '-b', 'main'], { cwd: remote, stdio: 'pipe' });
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: root, stdio: 'pipe' });
  ok(root, 'review', id, '--note', 'initial review');
  const denied = run(root, 'merge', id); assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /chalk review/);
  assert.equal(fs.existsSync(merged), false); assert.equal(store.task(id).state, 'in-progress');
  execFileSync('git', ['add', 'source.cjs'], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'publish reviewed correction'], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['push', 'origin', 'main'], { cwd: root, stdio: 'pipe' });
  ok(root, 'review', id, '--note', 'review changed source'); ok(root, 'merge', id);
  assert.equal(fs.readFileSync(merged, 'utf8'), 'merged'); assert.equal(store.task(id).state, 'done');
});

test('run refuses completion when review publication changes the verified source', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));`);
  fs.writeFileSync(join(root, 'gh.cjs'), candidateGh(`if(process.argv.includes('comment'))require('fs').writeFileSync('source.cjs','module.exports = 2;\\n');process.stdin.resume();`, { commonjs: true }));
  const meta = store.meta(); meta.protocol.executor = { command: 'node check.cjs' }; meta.protocol.review.command = 'node review.cjs'; meta.protocol.github = { command: 'node gh.cjs' }; meta.protocol.requireTest = false; store.saveMeta(meta);
  const task = store.task(id); task.state = 'specd'; task.pr = { number: 7, recorded: true }; store.upsertTask(task);
  ok(root, 'run', '--max', '1');
  const result = store.task(id); assert.equal(result.state, 'blocked'); assert.match(result.block.reason, /stale.*chalk (verify|review)/);
  assert.equal(result.doneAt, undefined); assert.equal(currentReview(store, result), false);
});

test('review rejects a restored configuration change in the canonical spine outside its worktree', t => {
  const { root, store, id } = fixture(t), worktree = fs.mkdtempSync(join(tmpdir(), 'chalk-review-worktree-'));
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }));
  fs.writeFileSync(join(worktree, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{const fs=require('fs'),p=${JSON.stringify(join(root, '.chalk/chalk.json'))},original=fs.readFileSync(p);const meta=JSON.parse(original);meta.protocol.verify.test='node other.cjs';fs.writeFileSync(p,JSON.stringify(meta));fs.writeFileSync(p,original);console.log(JSON.stringify({verdict:'pass',findings:[]}));});`);
  const meta = store.meta(); meta.protocol.review.command = 'node review.cjs'; store.saveMeta(meta);
  const task = store.task(id); task.worktree = worktree; store.upsertTask(task);
  const result = run(root, 'review', id); assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /changed during review.*chalk review/);
  assert.equal(store.task(id).reviews.length, 0, 'no temporary-config verdict was accepted');
});

test('audit rejects a temporary source file removed before the regression command returns', t => {
  const { root, store } = fixture(t);
  fs.writeFileSync(join(root, 'probe.cjs'), `const fs=require('fs');fs.writeFileSync('temporary-source.cjs','module.exports=2;');fs.unlinkSync('temporary-source.cjs');`);
  const meta = store.meta(); meta.protocol.regression = { required: true, command: 'node probe.cjs', tests: [], locPerTest: 1e9 }; store.saveMeta(meta);
  const result = run(root, 'audit'); assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /changed during audit.*chalk audit/);
  assert.equal(store.protocol().regression.lastAudit.green, false); assert.equal(fs.existsSync(join(root, 'temporary-source.cjs')), false);
  assert.notEqual(run(root, 'phase', 'delivery').status, 0);
});

test('phase admission rechecks registered regression-lock integrity after an audit', t => {
  const { root, store } = fixture(t), dir = join(root, 'regression-fixture'); fs.mkdirSync(dir);
  // A visible integrity fixture, not assertions from the project's held-out set.
  const input = join(dir, 'input.txt'); fs.writeFileSync(input, 'original');
  const meta = store.meta(); meta.protocol.review = { requiredAt: [] };
  meta.protocol.regression = { required: true, command: 'node check.cjs', dir: 'regression-fixture', tests: [{ path: 'regression-fixture/input.txt', sha256: sha256('original') }], locPerTest: 1e9 }; store.saveMeta(meta);
  ok(root, 'audit'); fs.writeFileSync(input, 'tampered');
  const denied = run(root, 'phase', 'delivery'); assert.notEqual(denied.status, 0); assert.match(denied.stdout + denied.stderr, /chalk audit/);
  assert.notEqual(run(root, 'audit').status, 0);
});
