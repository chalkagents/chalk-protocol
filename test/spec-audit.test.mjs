import { candidateGh } from '../scripts/test-gh-candidate.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { auditApprovalCurrent, auditSpecificationDigest } from '../lib/audit-specification.mjs';
import { runArchive } from '../lib/archive.mjs';
const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-spec-audit-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'main'); fs.mkdirSync(root); ok(root, 'init', '--bare');
  const store = new Store(root), id = 'task-audit';
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'phase.cjs'), `const fs=require('fs');const t=JSON.parse(fs.readFileSync('.chalk/tasks.json')).find(t=>t.id===${JSON.stringify(id)});process.exit(String(t.specRevision||0)===fs.readFileSync('phase-approved.txt','utf8')?0:7);`);
  fs.writeFileSync(join(root, 'phase-approved.txt'), '0');
  const meta = store.meta();
  meta.protocol.verify = { test: { cmd: 'node check.cjs', when: 'task' }, build: { cmd: 'node phase.cjs', when: 'phase' } };
  meta.protocol.regression = { required: true, command: '', tests: [], locPerTest: 1e9 };
  meta.protocol.review = { requiredAt: [] }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'audit current contract', state: 'specd', acceptanceCriteria: [{ text: 'old contract' }], tests: [], reviews: [] });
  ok(root, 'start', id);
  return { parent, root, store, id };
}
for (const operation of ['criterion', 'test']) {
  test(`${operation} amendment makes an earlier green audit insufficient for phase and merge, with fresh-audit recovery`, t => {
    const { parent, root, store, id } = fixture(t), bare = join(parent, 'remote'), merged = join(parent, 'merged');
    fs.mkdirSync(bare);
    fs.writeFileSync(join(root, 'gh.cjs'), candidateGh(`const a=process.argv.slice(2);if(a.includes('checks'))console.log(JSON.stringify([{bucket:'pass'}]));if(a.includes('merge'))require('fs').writeFileSync(${JSON.stringify(merged)},'merged');`, { commonjs: true }));
    const meta = store.meta(); meta.protocol.github = { command: 'node gh.cjs', ciPollAttempts: 0 }; store.saveMeta(meta);
    git(bare, 'init', '--bare', '-b', 'main'); git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
    git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main');
    git(root, 'switch', '-c', 'fix/audit'); git(root, 'push', '-u', 'origin', 'fix/audit');
    let task = store.task(id); task.branch = 'fix/audit'; task.pr = { number: 7, recorded: true }; task.pipeline = { stage: 'pr-open' }; store.upsertTask(task);
    ok(root, 'audit'); const oldAudit = store.protocol().regression.lastAudit; assert.ok(auditApprovalCurrent(store));
    const args = operation === 'criterion' ? ['--replace', 'ac-1', '--criterion', 'new contract'] : ['--test', 'check.cjs'];
    ok(root, 'amend-spec', id, ...args, '--why', 'changed phase contract');
    assert.equal(store.protocol().regression.lastAudit.green, true, 'old audit stays historical');
    assert.equal(auditApprovalCurrent(store), false);
    if (operation === 'criterion') {
      ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'old contract', '--why', 'restore wording without restoring old approval');
      assert.equal(auditApprovalCurrent(store), false, 'restored wording cannot revive the earlier audit');
    }
    assert.equal(spawnSync(process.execPath, ['phase.cjs'], { cwd: root }).status, 7, 'the phase-only check now fails');
    assert.notEqual(run(root, 'phase', 'delivery').status, 0);
    assert.match(ok(root, 'next', '--verbose'), /audit is stale/);
    const refused = run(root, 'merge', id); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /current specification.*chalk audit/);
    assert.equal(fs.existsSync(merged), false); assert.equal(store.task(id).state, 'in-progress');
    assert.notEqual(run(root, 'audit').status, 0); assert.equal(auditApprovalCurrent(store), false);
    fs.writeFileSync(join(root, 'phase-approved.txt'), String(store.task(id).specRevision));
    git(root, 'add', 'phase-approved.txt'); git(root, 'commit', '-m', 'support amended phase contract'); ok(root, 'pr', id);
    ok(root, 'audit'); assert.ok(auditApprovalCurrent(store)); assert.notEqual(store.protocol().regression.lastAudit.specificationDigest, oldAudit.specificationDigest);
    ok(root, 'phase', 'delivery'); ok(root, 'merge', id);
    assert.equal(fs.readFileSync(merged, 'utf8'), 'merged'); assert.equal(store.task(id).state, 'done');
  });
}
test('audit identity excludes completion bookkeeping and survives archival; legacy audit cannot cover an amendment', t => {
  const { root, store, id } = fixture(t);
  const legacy = { green: true }; assert.equal(auditApprovalCurrent(store, legacy), false, 'unidentified legacy audit is historical even before an amendment');
  const original = auditSpecificationDigest(store);
  let task = store.task(id); task.state = 'done'; task.released = '1.0'; task.doneAt = new Date().toISOString(); store.upsertTask(task);
  assert.equal(auditSpecificationDigest(store), original);
  runArchive(store); assert.equal(auditSpecificationDigest(store), original);
  // A separate active task's amendment must also invalidate a required audit.
  store.upsertTask({ id: 'task-new', title: 'new', state: 'specd', acceptanceCriteria: [{ text: 'first' }], tests: [] });
  ok(root, 'amend-spec', 'task-new', '--add', 'second', '--why', 'new contract');
  assert.equal(auditApprovalCurrent(store, legacy), false);
});
test('an amendment during audit cannot produce a current green approval', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'amend.cjs'), `require('child_process').execFileSync(${JSON.stringify(process.execPath)},${JSON.stringify([CLI, 'amend-spec', id, '--add', 'changed during audit', '--why', 'concurrent correction'])},{stdio:'pipe'});`);
  const meta = store.meta(); meta.protocol.regression.command = 'node amend.cjs'; store.saveMeta(meta);
  const result = run(root, 'audit'); assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /specification changed during audit/);
  assert.equal(store.protocol().regression.lastAudit.green, false); assert.equal(auditApprovalCurrent(store), false);
});
