import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../lib/store.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

const CLI = resolve('bin/chalk.mjs');

test('chalk run binds its advancing receipt after a required passing review', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-run-review-receipt-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry'], { cwd: root });
  writeFileSync(join(root, 'source.js'), 'export const value = 1;\n');
  writeFileSync(join(root, 'check.cjs'), 'console.log("verified");\n');
  writeFileSync(join(root, 'executor.cjs'), 'process.stdin.resume();\n');
  writeFileSync(join(root, 'reviewer.cjs'), `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  const source = fs.readFileSync('source.js');
  fs.writeFileSync('source.js', source);
  process.stdout.write(JSON.stringify({ verdict: 'pass', findings: [] }));
});
`);

  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.executor.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'executor.cjs'))}`;
  meta.protocol.review = {
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'reviewer.cjs'))}`,
    requiredAt: ['per-task'],
  };
  store.saveMeta(meta);
  store.upsertTask({
    id: 'task-review-freshness', title: 'chore: review freshness', state: 'specd', branchType: 'chore',
    acceptanceCriteria: [{ text: 'reviewed source is re-verified' }], tests: [], reviews: [],
  });

  const result = spawnSync(process.execPath, [CLI, 'run', '--max', '1', '--until', 'blocked'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  const records = readdirSync(join(root, '.chalk/local/verification'))
    .map(name => JSON.parse(readFileSync(join(root, '.chalk/local/verification', name, 'run.json'), 'utf8')))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  assert.equal(result.status, 0, result.stdout + result.stderr + JSON.stringify({ task: store.task('task-review-freshness'), records }));
  assert.equal(records.length, 2, 'a required review is followed by a fresh verification');
  const current = sourceIdentity(root, store.protocol());
  assert.equal(current.status, 'known', current.error);
  assert.notEqual(records[0].before.source.digest, current.digest, 'the reviewer changed source metadata after the first receipt');
  assert.equal(records[1].green, true);
  assert.equal(records[1].freshness, 'fresh');
  assert.equal(records[1].before.source.digest, current.digest);
  assert.equal(records[1].after.source.digest, current.digest);
  assert.equal(store.task('task-review-freshness').state, 'done');
});

test('chalk run blocks when verification after a passing review is stale', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-run-review-stale-')));
  const reviewed = `${root}.reviewed`;
  t.after(() => {
    rmSync(reviewed, { force: true });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(process.execPath, [CLI, 'init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry'], { cwd: root });
  writeFileSync(join(root, 'source.js'), 'before\n');
  writeFileSync(join(root, 'check.cjs'), `const fs=require('node:fs');if(fs.existsSync(${JSON.stringify(reviewed)}))fs.writeFileSync('source.js','after\\n');`);
  writeFileSync(join(root, 'executor.cjs'), 'process.stdin.resume();\n');
  writeFileSync(join(root, 'reviewer.cjs'), `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  const source = fs.readFileSync('source.js');
  fs.writeFileSync('source.js', source);
  fs.writeFileSync(${JSON.stringify(reviewed)}, 'yes');
  process.stdout.write(JSON.stringify({ verdict: 'pass', findings: [] }));
});
`);

  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.executor.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'executor.cjs'))}`;
  meta.protocol.review = {
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'reviewer.cjs'))}`,
    requiredAt: ['per-task'],
  };
  store.saveMeta(meta);
  store.upsertTask({
    id: 'task-review-stale', title: 'chore: reject stale review', state: 'specd', branchType: 'chore',
    acceptanceCriteria: [{ text: 'stale reviewed source cannot advance' }], tests: [], reviews: [],
  });

  const result = spawnSync(process.execPath, [CLI, 'run', '--max', '1', '--until', 'blocked'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  const records = readdirSync(join(root, '.chalk/local/verification'))
    .map(name => JSON.parse(readFileSync(join(root, '.chalk/local/verification', name, 'run.json'), 'utf8')))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  assert.equal(records.length, 2, 'a required review is followed by a second verification');
  assert.equal(records[0].green, true);
  assert.equal(records[1].green, false);
  assert.equal(records[1].freshness, 'stale');
  const task = store.task('task-review-stale');
  assert.equal(task.state, 'blocked');
  assert.match(task.block.reason, /verify RED after executor/);
});
