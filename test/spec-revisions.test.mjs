import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { reviewEvidence } from '../lib/review-evidence.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (root, ...args) => { const r = run(root, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
function fixture(t, { legacy = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-spec-revisions-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare');
  fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  fs.writeFileSync(join(root, 'review.cjs'), 'process.stdin.resume(); process.stdin.on("end",()=>console.log(JSON.stringify({verdict:"pass",findings:[]})));');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.review = { command: 'node review.cjs', requiredAt: ['per-task'] };
  store.saveMeta(meta);
  const task = { id: 'task-revisions', title: 'revision contract', state: 'specd', acceptanceCriteria: [{ text: 'original visible behavior' }, { text: 'preserve input' }], tests: [], reviews: [] };
  if (legacy) store.saveTasks([task]); else store.upsertTask(task);
  return { root, store, id: task.id };
}

test('legacy criteria get stable IDs without a read-time migration; replace/retire/add retain definitions and reasons', t => {
  const { root, store, id } = fixture(t, { legacy: true });
  const raw = fs.readFileSync(store.p.tasks, 'utf8');
  assert.match(ok(root, 'context', id), /original visible behavior.*id: ac-1/);
  assert.equal(fs.readFileSync(store.p.tasks, 'utf8'), raw, 'context must not rewrite legacy tasks');
  ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'new visible behavior', '--why', 'production route needs refresh');
  ok(root, 'amend-spec', id, '--retire', 'ac-2', '--why', 'input requirement moved upstream');
  ok(root, 'amend-spec', id, '--add', 'fallback stays observable', '--why', 'cover offline refresh');
  const current = store.task(id);
  assert.deepEqual(current.acceptanceCriteria, [{ text: 'new visible behavior', id: 'ac-1' }, { id: 'ac-3', text: 'fallback stays observable' }]);
  const context = ok(root, 'context', id);
  assert.match(context, /new visible behavior/); assert.match(context, /fallback stays observable/);
  assert.doesNotMatch(context, /original visible behavior|preserve input/);
  const history = JSON.parse(ok(root, 'amend-spec', id, '--history'));
  assert.equal(history.revision, 3); assert.equal(history.revisions.length, 3);
  assert.equal(history.revisions[0].before.acceptanceCriteria[0].text, 'original visible behavior');
  assert.equal(history.revisions[0].after.acceptanceCriteria[0].id, 'ac-1');
  assert.equal(history.revisions[1].before.acceptanceCriteria[1].id, 'ac-2');
  assert.equal(history.revisions[1].why, 'input requirement moved upstream');
  assert.ok(history.revisions.every(r => Number.isFinite(Date.parse(r.at))));
  assert.match(fs.readFileSync(store.p.decisions, 'utf8'), /cover offline refresh/);
});

test('newly specified and imported-style tasks store stable criterion IDs', t => {
  const { root, store, id } = fixture(t);
  assert.equal(store.task(id).acceptanceCriteria[0].id, 'ac-1');
  ok(root, 'task', 'add', 'new task');
  const added = store.tasks().at(-1);
  ok(root, 'spec', added.id, '--criterion', 'one', '--criterion', 'two');
  assert.deepEqual(store.task(added.id).acceptanceCriteria.map(c => c.id), ['ac-1', 'ac-2']);
  ok(root, 'spec', added.id, '--criterion', 'three');
  assert.deepEqual(store.task(added.id).acceptanceCriteria.map(c => c.id), ['ac-1', 'ac-2', 'ac-3']);
});

test('invalid or incomplete amendment batches leave task, decisions and history untouched', t => {
  const { root, store, id } = fixture(t);
  const before = fs.readFileSync(store.p.tasks, 'utf8'), decisions = fs.readFileSync(store.p.decisions, 'utf8');
  for (const args of [
    ['--add', 'new'], ['--add', 'new', '--why', '   '], ['--add', '--why', 'reason'],
    ['--replace', 'ac-999', '--criterion', 'bad', '--why', 'reason'],
    ['--add', 'new', '--retire', 'ac-999', '--why', 'reason'],
    ['--add', 'temporary', '--retire', 'ac-3', '--why', 'cannot retire a guessed future ID'],
    ['--replace', 'ac-1', '--why', 'reason'], ['--add', 'new', '--test', 'missing', '--why', 'reason'],
    ['--history', '--retire', 'ac-1'], ['--add', 'new', '--whyy', 'typo', '--why', 'reason'],
  ]) {
    const r = run(root, 'amend-spec', id, ...args); assert.notEqual(r.status, 0, JSON.stringify(args));
    assert.equal(fs.readFileSync(store.p.tasks, 'utf8'), before);
    assert.equal(fs.readFileSync(store.p.decisions, 'utf8'), decisions);
  }
});

test('amendments invalidate review, alignment and plan approvals, including a verified pipeline shortcut', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'start', id); ok(root, 'align', id); ok(root, 'review', id);
  const task = store.task(id);
  task.plan = 'implement current criteria'; task.planApproved = { at: '2026-01-01', by: 'human' };
  task.pipeline = { stage: 'reviewed' }; task.pr = { number: 123 };
  store.upsertTask(task);
  const meta = store.meta(); meta.protocol.director = { required: true }; store.saveMeta(meta);
  ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'revised behavior', '--why', 'contract correction');
  const changed = store.task(id);
  assert.equal(changed.criteriaAccepted, undefined); assert.equal(changed.planApproved, undefined);
  assert.equal(changed.reviews.at(-1).verdict, 'stale');
  assert.equal(changed.specRevisions.at(-1).invalidated.review.verdict, 'pass');
  assert.equal(changed.specRevisions.at(-1).invalidated.criteriaAccepted.by, 'human');
  assert.equal(changed.specRevisions.at(-1).invalidated.planApproved.by, 'human');
  assert.equal(changed.pipeline.stage, 'reviewed'); assert.equal(changed.pr.number, 123, 'retain side-effect records');
  const work = run(root, 'work', id); assert.notEqual(work.status, 0); assert.match(work.stdout + work.stderr, /criteria not accepted/);
  const done = run(root, 'done', id); assert.notEqual(done.status, 0); assert.match(done.stdout + done.stderr, /review/);
});

test('additions through spec cannot preserve an established approval or silently replace a locked test', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'align', id);
  assert.notEqual(run(root, 'spec', id, '--criterion', 'another criterion').status, 0);
  ok(root, 'spec', id, '--criterion', 'another criterion', '--why', 'additional requirement');
  assert.equal(store.task(id).criteriaAccepted, undefined);
  fs.writeFileSync(join(root, 'locked.mjs'), 'original');
  ok(root, 'amend-spec', id, '--test', 'locked.mjs', '--why', 'add acceptance test');
  const lock = store.task(id).tests[0], revision = store.task(id).specRevision;
  fs.writeFileSync(join(root, 'locked.mjs'), 'changed');
  ok(root, 'spec', id, '--test', 'locked.mjs', '--why', 'cannot replace using spec');
  assert.deepEqual(store.task(id).tests[0], lock);
  assert.equal(store.task(id).specRevision, revision);
});

for (const operation of ['criteria-revert', 'same-test']) {
  test(`${operation} amendment leaves old verification evidence stale even when final contents match`, t => {
    const { root, store, id } = fixture(t);
    if (operation === 'same-test') ok(root, 'amend-spec', id, '--test', 'check.cjs', '--why', 'initial lock');
    ok(root, 'start', id); ok(root, 'verify');
    assert.equal(reviewEvidence(store, store.task(id), root).freshness.spec, 'fresh');
    if (operation === 'criteria-revert') {
      ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'temporary requirement', '--why', 'change');
      ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'original visible behavior', '--why', 'restore definition');
    } else {
      ok(root, 'align', id); ok(root, 'review', id);
      ok(root, 'amend-spec', id, '--test', 'check.cjs', '--why', 'authorize test revision');
      assert.equal(store.task(id).criteriaAccepted, undefined);
      assert.equal(store.task(id).reviews.at(-1).verdict, 'stale');
    }
    assert.equal(reviewEvidence(store, store.task(id), root).freshness.spec, 'stale');
    ok(root, 'verify');
    assert.equal(reviewEvidence(store, store.task(id), root).freshness.spec, 'fresh');
  });
}

test('concurrent amendments keep both changes and sequential revision histories', async t => {
  const { root, store, id } = fixture(t);
  await Promise.all(['first addition', 'second addition'].map(text => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'amend-spec', id, '--add', text, '--why', text], { cwd: root, stdio: 'ignore' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
  })));
  const current = store.task(id);
  assert.equal(current.acceptanceCriteria.length, 4);
  assert.equal(new Set(current.acceptanceCriteria.map(c => c.id)).size, 4);
  assert.deepEqual(current.specRevisions.map(r => r.revision), [1, 2]);
  assert.deepEqual(current.specRevisions[1].before, current.specRevisions[0].after);
});

test('the actual reviewer receives current criteria and does not receive retired definitions as the contract', t => {
  const { root, id } = fixture(t);
  const prompt = root + '-review-prompt.txt'; t.after(() => fs.rmSync(prompt, { force: true }));
  fs.writeFileSync(join(root, 'review.cjs'), `let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{require('fs').writeFileSync(${JSON.stringify(prompt)},input);console.log(JSON.stringify({verdict:'pass',findings:[]}));});`);
  ok(root, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'CURRENT_CONTRACT', '--retire', 'ac-2', '--why', 'consolidate requirements');
  ok(root, 'review', id);
  const input = fs.readFileSync(prompt, 'utf8');
  assert.match(input, /CURRENT_CONTRACT/);
  assert.doesNotMatch(input, /original visible behavior|preserve input/);
});

test('fresh work clears the invalidated verification shortcut and preserves an existing PR stage', t => {
  const { root, store, id } = fixture(t);
  const meta = store.meta(); meta.protocol.executor = { command: 'node check.cjs' }; meta.protocol.requireTest = false; store.saveMeta(meta);
  ok(root, 'start', id);
  const task = store.task(id); task.pipeline = { stage: 'pr-open' }; task.pr = { number: 123 }; store.upsertTask(task);
  ok(root, 'amend-spec', id, '--add', 'new requirement', '--why', 'expand coverage');
  const output = ok(root, 'work', id);
  assert.match(output, /verify green/); assert.doesNotMatch(output, /already verified/);
  assert.equal(store.task(id).pipeline.verificationInvalidated, undefined);
  assert.equal(store.task(id).pipeline.stage, 'pr-open'); assert.equal(store.task(id).pr.number, 123);
  assert.match(ok(root, 'work', id), /already verified/);
});

test('retiring an entire established contract is rejected, while retiring prose with a remaining locked test is allowed', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'start', id);
  const before = fs.readFileSync(store.p.tasks, 'utf8');
  const r = run(root, 'amend-spec', id, '--retire', 'ac-1', '--retire', 'ac-2', '--why', 'empty');
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /entire established contract/);
  assert.equal(fs.readFileSync(store.p.tasks, 'utf8'), before);
  ok(root, 'amend-spec', id, '--retire', 'ac-1', '--retire', 'ac-2', '--test', 'check.cjs', '--why', 'criteria expressed in locked test');
  assert.equal(store.task(id).acceptanceCriteria.length, 0); assert.equal(store.task(id).tests.length, 1);
});


test('a stale task writer cannot erase an amendment or restore old approvals', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'align', id);
  const old = store.task(id);
  ok(root, 'amend-spec', id, '--add', 'new requirement', '--why', 'parallel correction');
  old.planApproved = { at: 'old', by: 'human' };
  assert.throws(() => store.upsertTask(old), /specification changed/);
  assert.equal(store.task(id).acceptanceCriteria.at(-1).text, 'new requirement');
  assert.equal(store.task(id).criteriaAccepted, undefined);
  assert.equal(store.task(id).planApproved, undefined);
});

test('work cannot save its old task snapshot over a contract amended by the executor', t => {
  const { root, store, id } = fixture(t);
  const meta = store.meta();
  meta.protocol.executor = { command: 'node executor.cjs' }; meta.protocol.requireTest = false;
  store.saveMeta(meta);
  fs.writeFileSync(join(root, 'executor.cjs'), `require('child_process').execFileSync(process.execPath,${JSON.stringify([CLI, 'amend-spec', id, '--add', 'executor discovered a contract correction', '--why', 'record correction before continuing'])},{stdio:'ignore'});`);
  ok(root, 'start', id); ok(root, 'align', id);
  const result = run(root, 'work', id);
  assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /specification changed/);
  const task = store.task(id);
  assert.equal(task.acceptanceCriteria.at(-1).text, 'executor discovered a contract correction');
  assert.equal(task.specRevision, 1); assert.equal(task.criteriaAccepted, undefined);
  assert.equal(task.state, 'in-progress');
});
