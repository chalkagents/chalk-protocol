import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
import { postReviewToPr } from '../lib/prreview.mjs';

const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const ok = (cwd, ...args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr); return result;
};

for (const command of ['review', 'manual', 'run']) {
  test(`${command} publishes a revision-scoped verdict while amendments wait for publication`, t => {
    const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-review-publication-')));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'project'); fs.mkdirSync(root); ok(root, 'init', '--bare');
    const id = 'task-publication', comment = join(parent, 'comment'), reached = join(parent, 'reached'), attempted = join(parent, 'attempted');
    const amendment = join(parent, 'amend.mjs');
    fs.writeFileSync(amendment, `import fs from 'node:fs';import {Store} from ${JSON.stringify(STORE)};const lock=Store.prototype.withLock;Store.prototype.withLock=function(...args){fs.writeFileSync(${JSON.stringify(reached)},'reached');return lock.apply(this,args)};process.argv=${JSON.stringify([process.execPath, CLI, 'amend-spec', id, '--add', 'concurrent criterion', '--why', 'publication race'])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
    fs.writeFileSync(join(root, 'gh.cjs'), `let body='';process.stdin.on('data',c=>body+=c);process.stdin.on('end',()=>{if(!process.argv.includes('comment'))return;const fs=require('fs');const r=require('child_process').spawnSync(process.execPath,[${JSON.stringify(amendment)}],{cwd:${JSON.stringify(root)},encoding:'utf8',timeout:2000});fs.writeFileSync(${JSON.stringify(attempted)},JSON.stringify({status:r.status,error:r.error?.code,output:r.stdout+r.stderr}));fs.writeFileSync(${JSON.stringify(comment)},body);});`);
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));`);
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
    meta.protocol.executor = { command: 'node check.cjs' };
    meta.protocol.review = { command: command === 'manual' ? '' : 'node review.cjs', requiredAt: ['per-task'] };
    meta.protocol.github = { command: 'node gh.cjs' }; store.saveMeta(meta);
    store.upsertTask({ id, title: 'chore: publish review', state: 'specd', acceptanceCriteria: [{ text: 'initial contract' }], tests: [], reviews: [], pr: { number: 7, recorded: true } });
    if (command !== 'run') ok(root, 'start', id);
    if (command === 'run') ok(root, 'run', '--max', '1');
    else if (command === 'manual') ok(root, 'review', id, '--note', 'fixture review');
    else ok(root, 'review', id);
    assert.equal(fs.readFileSync(reached, 'utf8'), 'reached', 'concurrent amendment reached the real spine lock');
    const attempt = JSON.parse(fs.readFileSync(attempted));
    assert.equal(attempt.error, 'ETIMEDOUT', attempt.output);
    assert.equal(store.task(id).specRevision || 0, 0, 'amendment cannot land during publication');
    const body = fs.readFileSync(comment, 'utf8');
    assert.match(body, /LGTM/); assert.match(body, /only to specification revision 0/);
    assert.match(body, /Any amendment invalidates this review/); assert.doesNotMatch(body, /Clear to merge/);
    assert.equal(store.task(id).reviews.at(-1).verdict, 'pass');
    ok(root, 'amend-spec', id, '--add', 'later criterion', '--why', 'contract changed after publication');
    assert.equal(store.task(id).specRevision, 1); assert.equal(store.task(id).reviews.at(-1).verdict, 'stale');
    if (command === 'run') assert.ok(store.task(id).completionInvalidated);
  });
}

test('publication refuses a stale task snapshot before invoking GitHub', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-review-stale-publication-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); ok(root, 'init', '--bare');
  const store = new Store(root), meta = store.meta(), marker = join(root, 'posted');
  fs.writeFileSync(join(root, 'gh.cjs'), `require('fs').writeFileSync(${JSON.stringify(marker)},'posted');`);
  meta.protocol.github = { command: 'node gh.cjs' }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-stale', title: 'stale', state: 'in-progress', acceptanceCriteria: [{ text: 'initial' }], tests: [], pr: { number: 7 } });
  const snapshot = store.task('task-stale');
  ok(root, 'amend-spec', snapshot.id, '--add', 'changed', '--why', 'race before publication');
  const result = postReviewToPr(store, snapshot, { verdict: 'pass' });
  assert.equal(result.posted, false); assert.match(result.reason, /specification changed/); assert.equal(fs.existsSync(marker), false);
});
