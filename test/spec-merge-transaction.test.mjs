import { candidateGh } from '../scripts/test-gh-candidate.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store, retireLockGeneration } from '../lib/store.mjs';

const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

// https://github.com/chalkagents/chalk-protocol/issues/251 tracks Windows parity; this uses a POSIX Git shim.
test('merge rejects an amendment during publication I/O and protects final admission from lease takeover', { skip: process.platform === 'win32' }, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-merge-transaction-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'main'), bare = join(parent, 'remote'), shim = join(parent, 'shim'), merged = join(parent, 'merged'), fired = join(parent, 'fired');
  for (const dir of [root, bare, shim]) fs.mkdirSync(dir);
  ok(root, 'init', '--bare'); fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
  const id = 'task-transaction';
  fs.writeFileSync(join(root, 'gh.mjs'), candidateGh(`import fs from 'node:fs';import {retireLockGeneration} from ${JSON.stringify(STORE)};process.stdin.resume();const a=process.argv.slice(2);if(a.includes('checks'))console.log(JSON.stringify([{bucket:'pass'}]));if(a.includes('merge')){const lock=${JSON.stringify(join(root, '.chalk/.lock'))};const token=fs.readFileSync(lock+'/owner','utf8').split(' ')[0];const old=new Date(Date.now()-60000);fs.utimesSync(lock,old,old);const stolen=retireLockGeneration(lock,token,{requireStale:true});fs.writeFileSync(${JSON.stringify(merged)},JSON.stringify({stolen}));console.log('merged');}`));
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: ['per-task'] }; meta.protocol.github = { command: 'node gh.mjs', ciPollAttempts: 0 }; store.saveMeta(meta);
  store.upsertTask({ id, title: 'chore: merge transaction', state: 'specd', acceptanceCriteria: [{ text: 'original' }], tests: [], reviews: [] });
  git(bare, 'init', '--bare', '-b', 'main'); git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main');
  const branch = 'fix/transaction'; git(root, 'switch', '-c', branch); git(root, 'push', '-u', 'origin', branch);
  ok(root, 'start', id); let task = store.task(id); task.branch = branch; task.pr = { number: 7, recorded: true }; task.pipeline = { stage: 'pr-open' }; store.upsertTask(task);
  ok(root, 'amend-spec', id, '--add', 'first amendment', '--why', 'update contract'); ok(root, 'review', id, '--note', 'revision one accepted'); ok(root, 'pr', id);
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(join(shim, 'git'), `#!/usr/bin/env node\nconst fs=require('fs'),cp=require('child_process');const a=process.argv.slice(2);if(a[0]==='ls-remote'&&!fs.existsSync(${JSON.stringify(fired)})){fs.writeFileSync(${JSON.stringify(fired)},'fired');cp.execFileSync(${JSON.stringify(process.execPath)},${JSON.stringify([CLI, 'amend-spec', id, '--add', 'concurrent amendment', '--why', 'arrives during publication check'])},{cwd:${JSON.stringify(root)},env:{...process.env,PATH:${JSON.stringify(process.env.PATH)}},stdio:'ignore'});}const r=cp.spawnSync(${JSON.stringify(realGit)},a,{stdio:'inherit'});process.exit(r.status??1);`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [CLI, 'merge', id], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, NO_COLOR: '1' } });
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /specification changed before merge admission/);
  assert.equal(fs.existsSync(fired), true); assert.equal(fs.existsSync(merged), false, 'remote merge must not execute under the superseded contract');
  task = store.task(id); assert.equal(task.specRevision, 2); assert.equal(task.reviews.at(-1).verdict, 'stale'); assert.equal(task.state, 'in-progress');
  assert.equal(fs.existsSync(join(root, '.chalk/.lock')), false, 'refusal releases the lock');
  ok(root, 'review', id, '--note', 'revision two accepted'); ok(root, 'merge', id);
  assert.deepEqual(JSON.parse(fs.readFileSync(merged, 'utf8')), { stolen: false }, 'an expired wall-clock lease cannot be stolen during the remote side effect');
  task = store.task(id); assert.equal(task.state, 'done'); assert.equal(task.completedSpecRevision, 2);
  assert.equal(fs.existsSync(join(root, '.chalk/.lock')), false, 'successful admission releases the protected lock');
});

test('protected merge leases retain normal crash recovery once the owner is confirmed dead', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-dead-merge-owner-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ok(root, 'init', '--bare');
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']); assert.equal(child.status, 0);
  const lock = join(root, '.chalk/.lock'), token = `${child.pid}-finished`;
  fs.mkdirSync(lock); fs.writeFileSync(join(lock, 'owner'), `${token} protected=${child.pid}`);
  const old = new Date(Date.now() - 60000); fs.utimesSync(lock, old, old);
  assert.equal(retireLockGeneration(lock, token, { requireStale: true }), true);
  assert.equal(fs.existsSync(lock), false);
});
