import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-spec-handoff-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare');
  const store = new Store(root), id = 'task-handoff';
  store.upsertTask({ id, title: 'resume current contract', state: 'specd', acceptanceCriteria: [{ text: 'OBSOLETE_CRITERION' }, { text: 'RETAINED_CRITERION' }], tests: [] });
  ok(root, 'start', id);
  return { root, store, id };
}
for (const operation of ['replace', 'retire', 'test']) {
  test(`${operation} amendment retires the active handoff without losing historical documents`, t => {
    const { root, store, id } = fixture(t);
    ok(root, 'handoff', id, '--note', 'continue investigation');
    const previous = store.task(id).handoff;
    const original = fs.readFileSync(join(root, previous.path), 'utf8');
    assert.match(ok(root, 'context', id), /Handoff from the prior session/);
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const args = operation === 'replace' ? ['--replace', 'ac-1', '--criterion', 'CURRENT_CRITERION'] : operation === 'retire' ? ['--retire', 'ac-1'] : ['--test', 'check.cjs'];
    ok(root, 'amend-spec', id, ...args, '--why', 'update the resumption contract');
    const task = store.task(id);
    assert.equal(task.handoff, undefined);
    assert.deepEqual(task.specRevisions.at(-1).invalidated.handoff, previous);
    const context = ok(root, 'context', id);
    assert.doesNotMatch(context, /Handoff from the prior session/);
    if (operation !== 'test') assert.doesNotMatch(context, /OBSOLETE_CRITERION/);
    assert.equal(JSON.parse(ok(root, 'next', '--json')).handoff, null);
    assert.match(ok(root, 'amend-spec', id, '--history'), new RegExp(previous.path.replaceAll('.', '\\.')));
    ok(root, 'handoff', id, '--note', 'resume revised contract');
    const fresh = store.task(id).handoff;
    assert.ok(fresh.seq > previous.seq); assert.equal(fresh.specRevision, task.specRevision);
    assert.notEqual(fresh.path, previous.path);
    assert.equal(fs.readFileSync(join(root, previous.path), 'utf8'), original);
    assert.match(ok(root, 'context', id), /resume revised contract/);
    if (operation !== 'test') assert.doesNotMatch(ok(root, 'context', id), /OBSOLETE_CRITERION/);
  });
}
test('an amendment during handoff narration cannot reattach or overwrite the superseded contract', t => {
  const { root, store, id } = fixture(t);
  ok(root, 'handoff', id);
  const original = store.task(id).handoff;
  const contents = fs.readFileSync(join(root, original.path), 'utf8');
  fs.writeFileSync(join(root, 'narrate.cjs'), `require('child_process').execFileSync(${JSON.stringify(process.execPath)},${JSON.stringify([CLI, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'REVISED_DURING_NARRATION', '--why', 'concurrent correction'])},{stdio:'pipe'});console.log('old narrative');`);
  const meta = store.meta(); meta.protocol.handoff = { command: 'node narrate.cjs' }; store.saveMeta(meta);
  const result = run(root, 'handoff', id);
  assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /specification changed while preparing handoff/);
  assert.equal(store.task(id).handoff, undefined);
  assert.equal(fs.readFileSync(join(root, original.path), 'utf8'), contents);
  assert.deepEqual(fs.readdirSync(join(root, '.chalk/handoffs')), [original.path.split('/').at(-1)]);
  assert.doesNotMatch(ok(root, 'context', id), /OBSOLETE_CRITERION|old narrative/);
});
