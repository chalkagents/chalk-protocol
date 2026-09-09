import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { mergeBlockers } from '../lib/mergegate.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (root, ...args) => { const r = run(root, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
function fixture(t, required = true) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-amend-admission-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare');
  fs.writeFileSync(join(root, 'check.cjs'), 'process.exit(0);');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
  fs.writeFileSync(join(root, 'planner.cjs'), 'console.log("satisfy the current contract");');
  meta.protocol.planner = { command: 'node planner.cjs' };
  meta.protocol.plan = { required }; meta.protocol.director = { required }; meta.protocol.review = { requiredAt: [] };
  store.saveMeta(meta);
  const id = 'task-admission';
  store.upsertTask({ id, title: 'chore: admission', state: 'specd', plan: 'satisfy the current contract', acceptanceCriteria: [{ text: 'original contract' }], tests: [], reviews: [] });
  if (required) { ok(root, 'align', id); ok(root, 'plan', id); ok(root, 'approve-plan', id); }
  return { root, store, id };
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function remoteFixture(t, root) {
  const bare = fs.mkdtempSync(join(tmpdir(), 'chalk-amend-remote-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  git(bare, 'init', '--bare', '-b', 'main');
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial');
  git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main');
  const branch = 'fix/amended-contract'; git(root, 'switch', '-c', branch); git(root, 'push', '-u', 'origin', branch);
  return { bare, branch };
}

test('done requires renewed alignment AND plan approval after amendment, then admits fresh approvals', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'start', id);
  ok(root, 'amend-spec', id, '--add', 'corrected contract', '--why', 'new requirement');
  let r = run(root, 'done', id); assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /approve-plan/); assert.match(r.stdout + r.stderr, /chalk align/);
  assert.equal(store.task(id).state, 'in-progress');
  ok(root, 'align', id);
  r = run(root, 'done', id); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /approve-plan/);
  ok(root, 'plan', id); ok(root, 'approve-plan', id); ok(root, 'done', id);
  assert.equal(store.task(id).state, 'done'); assert.equal(store.task(id).pipeline.verificationInvalidated, undefined);
});

test('run rechecks approvals after an executor amendment; renewed approvals permit work and done', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'executor.cjs'), `const fs=require('fs');const task=JSON.parse(fs.readFileSync('.chalk/tasks.json'))[0];if(!task.specRevision)require('child_process').execFileSync(process.execPath,${JSON.stringify([CLI, 'amend-spec', id, '--add', 'executor correction', '--why', 'newly identified requirement'])},{stdio:'ignore'});`);
  const meta = store.meta(); meta.protocol.executor = { command: 'node executor.cjs' }; store.saveMeta(meta);
  run(root, 'run', '--max', '1');
  let task = store.task(id);
  assert.equal(task.state, 'blocked'); assert.match(task.block.reason, /approve-plan/); assert.match(task.block.reason, /chalk align/);
  assert.equal(task.criteriaAccepted, undefined); assert.equal(task.planApproved, undefined);
  assert.equal(task.acceptanceCriteria.at(-1).text, 'executor correction');
  ok(root, 'align', id); ok(root, 'plan', id); ok(root, 'approve-plan', id); ok(root, 'unblock', id);
  ok(root, 'work', id); ok(root, 'done', id);
  task = store.task(id); assert.equal(task.state, 'done'); assert.equal(task.specRevision, 1);
});

for (const required of [false, true]) {
  test(`merge enforces amended-contract verification and required approvals (required=${required})`, t => {
    const { root, store, id } = fixture(t, required);
    const marker = root + '-merged'; t.after(() => fs.rmSync(marker, { force: true }));
    fs.writeFileSync(join(root, 'gh.cjs'), `const a=process.argv.slice(2);if(a.includes('checks'))console.log(JSON.stringify([{bucket:'pass'}]));else if(a.includes('merge')){require('fs').writeFileSync(${JSON.stringify(marker)},'merged');console.log('merged');}`);
    const meta = store.meta(); meta.protocol.github = { command: 'node gh.cjs', ciPollAttempts: 0 }; store.saveMeta(meta);
    const { branch } = remoteFixture(t, root);
    ok(root, 'start', id);
    let task = store.task(id); task.branch = branch; task.pr = { number: 7, recorded: true }; task.pipeline = { stage: 'pr-open' }; store.upsertTask(task);
    ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'new contract', '--why', 'correct release contract');
    fs.writeFileSync(join(root, 'check.cjs'), 'process.exit(7);');
    let r = run(root, 'merge', id); assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /local verify is not green/);
    assert.equal(fs.existsSync(marker), false, 'green remote CI cannot authorize the merge');
    fs.writeFileSync(join(root, 'check.cjs'), 'process.exit(0);');
    if (required) {
      r = run(root, 'merge', id); assert.notEqual(r.status, 0);
      assert.match(r.stdout + r.stderr, /approve-plan/); assert.match(r.stdout + r.stderr, /chalk align/);
      assert.equal(fs.existsSync(marker), false);
      ok(root, 'align', id); ok(root, 'plan', id); ok(root, 'approve-plan', id);
    }
    ok(root, 'pr', id);
    ok(root, 'merge', id);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'merged');
    task = store.task(id); assert.equal(task.state, 'done'); assert.equal(task.pipeline.verificationInvalidated, undefined);
  });
}

test('merge decision rejects missing or wrong-revision verification for an amended contract', () => {
  const task = { specRevision: 2, pipeline: { verificationInvalidated: 2 }, pr: { recorded: true } };
  for (const broke of [{ ok: true, source: 'ci' }, { ok: true, source: 'local' }, { ok: true, source: 'local', contractRevision: 1 }]) {
    assert.ok(mergeBlockers({}, task, { reviewRequired: false, broke }).some(reason => /current-contract verification/.test(reason)));
  }
  assert.deepEqual(mergeBlockers({}, task, { reviewRequired: false, broke: { ok: true, source: 'local', contractRevision: 2 } }), []);
});


test('amendment work and follow-up commit reach the existing PR remote before merge admits the correction', t => {
  const { root, store, id } = fixture(t, false);
  fs.writeFileSync(join(root, 'value.txt'), 'old');
  fs.writeFileSync(join(root, 'check.cjs'), "require('assert').equal(require('fs').readFileSync('value.txt','utf8'),'old');");
  const newCheck = "require('assert').equal(require('fs').readFileSync('value.txt','utf8'),'new');";
  fs.writeFileSync(join(root, 'executor.cjs'), `require('fs').writeFileSync('value.txt','new'); require('fs').writeFileSync('check.cjs',${JSON.stringify(newCheck)});`);
  fs.writeFileSync(join(root, 'gh.cjs'), "const a=process.argv.slice(2);if(a.includes('checks'))console.log(JSON.stringify([{bucket:'pass'}]));else if(a.includes('create'))process.exit(17);else if(a.includes('merge'))console.log('merged');");
  const meta = store.meta(); meta.protocol.executor = { command: 'node executor.cjs' }; meta.protocol.github = { command: 'node gh.cjs', ciPollAttempts: 0 }; store.saveMeta(meta);
  const { bare, branch } = remoteFixture(t, root);
  execFileSync(process.execPath, ['check.cjs'], { cwd: root }); // the old remote candidate was healthy
  ok(root, 'start', id);
  let task = store.task(id); task.branch = branch; task.pr = { number: 7, recorded: true }; task.pipeline = { stage: 'pr-open' }; store.upsertTask(task);
  ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'value is new on the release branch', '--why', 'correct released behavior');
  ok(root, 'work', id);
  assert.equal(fs.readFileSync(join(root, 'value.txt'), 'utf8'), 'new');
  assert.equal(git(bare, 'show', `${branch}:value.txt`), 'old');
  let r = run(root, 'merge', id); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /chalk commit/);
  ok(root, 'commit', id);
  assert.equal(git(root, 'show', 'HEAD:value.txt'), 'new');
  assert.equal(git(bare, 'show', `${branch}:value.txt`), 'old');
  r = run(root, 'merge', id); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /chalk pr/);
  assert.equal(store.task(id).state, 'in-progress');
  ok(root, 'pr', id); // fake gh refuses PR creation: this must update the existing one.
  assert.equal(git(bare, 'show', `${branch}:value.txt`), 'new');
  assert.equal(git(bare, 'rev-parse', branch), git(root, 'rev-parse', 'HEAD'));
  assert.equal(store.task(id).pr.number, 7);
  assert.equal(store.task(id).pipeline.publicationInvalidated, undefined);
  ok(root, 'merge', id);
  task = store.task(id); assert.equal(task.state, 'done');
  assert.equal(git(bare, 'show', `${branch}:value.txt`), 'new', 'the remote candidate contains the verified correction at completion');
});
