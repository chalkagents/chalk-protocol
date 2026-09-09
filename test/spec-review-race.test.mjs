import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

for (const command of ['run', 'review']) {
  test(`${command} rejects an in-flight verdict after a canonical-spine amendment outside the review worktree`, t => {
    const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-review-revision-')));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main'), wt = join(parent, 'worktree'), posted = join(parent, 'posted');
    fs.mkdirSync(root); ok(root, 'init', '--bare');
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const id = 'task-race';
    // Models an amendment arriving during review. The canonical spine is outside
    // the reviewer's linked worktree, so the workspace read-only guard is intact.
    fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{const fs=require('fs');const t=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, '.chalk/tasks.json'))}))[0];if(!t.specRevision)require('child_process').execFileSync(process.execPath,${JSON.stringify([CLI, 'amend-spec', id, '--add', 'new contract during review', '--why', 'concurrent correction'])},{cwd:${JSON.stringify(root)},stdio:'ignore'});console.log(JSON.stringify({verdict:'pass',findings:[]}));});`);
    fs.writeFileSync(join(root, 'gh.cjs'), `process.stdin.resume();if(process.argv.includes('comment'))require('fs').writeFileSync(${JSON.stringify(posted)},'posted');`);
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.requireTest = false;
    meta.protocol.executor = { command: 'node check.cjs' };
    meta.protocol.review = { command: 'node review.cjs', requiredAt: ['per-task'] };
    meta.protocol.github = { command: 'node gh.cjs' }; store.saveMeta(meta);
    store.upsertTask({ id, title: 'chore: concurrent review', state: 'specd', acceptanceCriteria: [{ text: 'old contract' }], tests: [], reviews: [], pr: { number: 7, recorded: true }, worktree: wt });
    git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
    git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial'); git(root, 'worktree', 'add', '-b', 'fix/review-race', wt);
    if (command === 'review') ok(root, 'start', id);
    const result = command === 'run' ? run(root, 'run', '--max', '1') : run(root, 'review', id);
    let task = store.task(id);
    assert.equal(task.specRevision, 1, result.stdout + result.stderr);
    assert.equal(task.reviews.some(r => r.verdict === 'pass'), false, 'old verdict must never enter the new revision');
    assert.equal(fs.existsSync(posted), false, 'old verdict must not be posted to the PR');
    if (command === 'run') {
      assert.equal(task.state, 'blocked'); assert.equal(task.block.needs, 'review');
      assert.match(task.block.reason, /specification changed during review/);
      ok(root, 'unblock', id);
    } else {
      assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /specification changed during review/);
    }
    const done = run(root, 'done', id); assert.notEqual(done.status, 0); assert.match(done.stdout + done.stderr, /passing adversarial review/);
    assert.equal(store.task(id).state, 'in-progress');
    ok(root, 'review', id);
    task = store.task(id); assert.equal(task.reviews.at(-1).specRevision, 1);
    assert.equal(fs.readFileSync(posted, 'utf8'), 'posted');
    ok(root, 'done', id); assert.equal(store.task(id).state, 'done');
  });
}
