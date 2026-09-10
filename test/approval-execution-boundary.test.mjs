import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runReview } from '../lib/review.mjs';
import { checkApproval } from '../lib/approval-inputs.mjs';
const CLI = resolve('bin/chalk.mjs');
function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-execution-boundary-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root);
  const initialized = spawnSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, encoding: 'utf8' }); assert.equal(initialized.status, 0, initialized.stderr);
  fs.writeFileSync(join(root, 'executor.cjs'), 'console.log("executed");');
  const store = new Store(root), id = 'task-boundary', meta = store.meta();
  meta.protocol.executor = { command: 'node executor.cjs' }; meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.requireTest = false; meta.protocol.review = { requiredAt: [] }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'chore: boundary', state: 'specd', acceptanceCriteria: [{ text: 'current inputs' }], tests: [], reviews: [] });
  return { parent, root, store, id };
}

test('review cannot certify an old reviewer under configuration selected after its metadata read', t => {
  const { parent, root, store, id } = fixture(t);
  for (const verdict of ['pass', 'block']) fs.writeFileSync(join(root, `${verdict}.cjs`), `process.stdin.resume();process.stdin.on('end',()=>{require('fs').writeFileSync(${JSON.stringify(join(parent, verdict))},'executed');console.log(JSON.stringify({verdict:${JSON.stringify(verdict)},findings:[]}));});`);
  const meta = store.meta(); meta.protocol.review.command = 'node pass.cjs'; store.saveMeta(meta);
  const readMeta = store.meta.bind(store); let switched = false;
  store.meta = () => {
    const captured = readMeta();
    if (!switched) { switched = true; const changed = structuredClone(captured); changed.protocol.review.command = 'node block.cjs'; store.saveMeta(changed); }
    return captured;
  };
  const result = runReview(store, store.task(id));
  assert.equal(result.status === 'ok' && result.verdict === 'pass' && checkApproval(store, 'review', result, store.task(id)).current, false, 'an old reviewer must not receive a current approval for the new profile');
  assert.equal(fs.existsSync(join(parent, 'pass')), false);
  assert.equal(fs.existsSync(join(parent, 'block')), true, 'the current reviewer executes after observation begins');
});

for (const command of ['work', 'run']) test(`${command} preserves initial verification freshness diagnostics and recovery`, t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'check.cjs'), `const fs=require('fs'),p='.chalk/spec.md',before=fs.readFileSync(p);fs.writeFileSync(p,'temporary specification');fs.writeFileSync(p,before);`);
  const result = spawnSync(process.execPath, [CLI, command, ...(command === 'run' ? ['--max', '1'] : [id])], { cwd: root, encoding: 'utf8' });
  const task = store.task(id);
  if (command === 'work') {
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /source, specification or configuration changed during verification/); assert.match(result.stdout + result.stderr, /chalk verify/);
  } else {
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(task.state, 'blocked'); assert.equal(task.block.needs, 'review');
    assert.match(task.block.reason, /source, specification or configuration changed during verification/); assert.match(task.block.reason, /chalk verify/);
    const handoff = fs.readFileSync(join(root, task.handoff.path), 'utf8'); assert.match(handoff, /source, specification or configuration changed during verification/); assert.match(handoff, /chalk verify/);
  }
  assert.notEqual(task.state, 'done');
});

test('malformed reviewer output does not erase a detected input change', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{const fs=require('fs'),p='.chalk/spec.md',before=fs.readFileSync(p);fs.writeFileSync(p,'temporary specification');fs.writeFileSync(p,before);console.log('not JSON');});`);
  const meta = store.meta(); meta.protocol.review.command = 'node review.cjs'; store.saveMeta(meta);
  const result = runReview(store, store.task(id)); assert.equal(result.status, 'error');
  const diagnostic = result.diagnostics.find(d => d.code === 'approval-inputs'); assert.ok(diagnostic, JSON.stringify(result)); assert.match(diagnostic.message, /chalk review task-boundary/);
});

test('review preflights split-index cache writes and resumes after materializing the same staged content', t => {
  const { root, store, id } = fixture(t);
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));`);
  const meta = store.meta(); meta.protocol.review.command = 'node review.cjs'; store.saveMeta(meta);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.'); git('commit', '-qm', 'fixture');
  fs.writeFileSync(join(root, 'executor.cjs'), 'console.log("changed");'); git('add', 'executor.cjs'); git('update-index', '--split-index');
  const staged = git('diff', '--cached');
  const refused = runReview(store, store.task(id)); assert.equal(refused.status, 'error');
  assert.match(refused.diagnostics[0].message, /git update-index --no-split-index/); assert.match(refused.diagnostics[0].message, /chalk review task-boundary/);
  git('update-index', '--no-split-index'); assert.equal(git('diff', '--cached'), staged);
  const renewed = runReview(store, store.task(id)); assert.equal(renewed.status, 'ok', JSON.stringify(renewed)); assert.equal(renewed.verdict, 'pass');
});
