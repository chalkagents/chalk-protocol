import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runReview } from '../lib/review.mjs';

for (const change of ['unchanged', 'restored-link', 'restored-policy']) test(`review observes symlinked Git policy parents (${change})`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-policy-symlink-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'), real = join(parent, 'real'), link = join(parent, 'linked'), alternate = join(parent, 'alternate');
  for (const dir of [root, real, alternate]) fs.mkdirSync(dir);
  for (const dir of [real, alternate]) fs.writeFileSync(join(dir, 'gitconfig'), '[user]\nname = Fixture\n');
  fs.symlinkSync(real, link, 'dir');
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(join(root, 'source.txt'), 'before'); git('add', 'source.txt'); git('commit', '-qm', 'fixture'); fs.writeFileSync(join(root, 'source.txt'), 'after');
  const action = change === 'restored-link'
    ? `fs.unlinkSync(${JSON.stringify(link)});fs.symlinkSync(${JSON.stringify(alternate)},${JSON.stringify(link)},'dir');fs.readFileSync(${JSON.stringify(join(link, 'gitconfig'))});fs.unlinkSync(${JSON.stringify(link)});fs.symlinkSync(${JSON.stringify(real)},${JSON.stringify(link)},'dir');`
    : change === 'restored-policy' ? `const p=${JSON.stringify(join(link, 'gitconfig'))},b=fs.readFileSync(p);fs.writeFileSync(p,'');fs.writeFileSync(p,b);` : '';
  fs.writeFileSync(join(root, 'review.cjs'), `process.stdin.resume();process.stdin.on('end',()=>{const fs=require('fs');${action}console.log(JSON.stringify({verdict:'pass',findings:[]}));});`);
  const store = new Store(root), meta = store.meta(); meta.protocol.review = { command: 'node review.cjs', requiredAt: ['per-task'] }; store.saveMeta(meta);
  const task = { id: 'task-policy', title: 'chore: fixture', state: 'in-progress', acceptanceCriteria: [{ text: 'current requirement' }], tests: [] }; store.upsertTask(task);
  const previous = process.env.GIT_CONFIG_SYSTEM;
  try {
    process.env.GIT_CONFIG_SYSTEM = join(link, 'gitconfig');
    const result = runReview(store, task);
    if (change === 'unchanged') { assert.equal(result.status, 'ok', JSON.stringify(result)); assert.equal(result.verdict, 'pass'); }
    else { assert.equal(result.status, 'error', JSON.stringify(result)); assert.match(JSON.stringify(result), /changed during review/); }
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_SYSTEM; else process.env.GIT_CONFIG_SYSTEM = previous; }
});
