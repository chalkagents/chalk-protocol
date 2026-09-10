import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { reviewEvidence, formatReviewEvidence, formatPrEvidence, PR_EVIDENCE_LIMIT } from '../lib/review-evidence.mjs';
import { buildPrBody } from '../lib/prbody.mjs';

function fixture(t, fail = false) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-evidence-handoff-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  fs.writeFileSync(join(root, 'source.js'), 'initial source\n');
  fs.writeFileSync(join(root, 'check.cjs'), `const fs=require('fs');const p='.chalk/local/counter';fs.writeFileSync(p,String(Number(fs.existsSync(p)?fs.readFileSync(p):0)+1));console.log('PRIVATE_RAW_OUTPUT');process.exit(${fail ? 1 : 0});`);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs --private-command-token' }; store.saveMeta(meta);
  const task = { id: 'task-handoff', title: 'evidence handoff', state: 'in-progress', acceptanceCriteria: [{ text: 'record actual command outcomes' }], tests: [], reviews: [] };
  store.upsertTask(task);
  return { root, store, task };
}
const payload = body => JSON.parse(body.match(/```json\n([\s\S]*?)\n```/)[1]);
const pr = (store, task) => buildPrBody(store, task, { changed: ['source.js'] });

test('PRs with no receipt show missing evidence and never claim a green run', t => {
  const { root, store, task } = fixture(t);
  const body = pr(store, task);
  assert.equal(payload(body).state, 'missing');
  assert.equal(payload(body).recordedGreen, null);
  assert.doesNotMatch(body, /`chalk verify` green/);
  assert.equal(fs.existsSync(join(root, '.chalk/local/counter')), false, 'rendering evidence must not execute checks');
  assert.equal(store.task(task.id).state, 'in-progress');
});

test('real completed commands supply identical timing and identity to review and PR without exposing local output', t => {
  const { root, store, task } = fixture(t), result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  const record = JSON.parse(fs.readFileSync(result.evidence.path, 'utf8'));
  const command = record.toolchain.find(item => item.gate === 'test');
  const local = reviewEvidence(store, task), review = payload(formatReviewEvidence(local));
  const body = pr(store, task), published = payload(body), check = published.commands.find(item => item.gate === 'test');
  assert.equal(published.state, 'current'); assert.equal(published.recordedGreen, true);
  assert.equal(published.sourceFingerprint, record.before.source.digest);
  assert.deepEqual(published.freshness, review.freshness);
  for (const summary of [check, review.commands.find(item => item.gate === 'test')]) {
    assert.equal(summary.status, 'pass'); assert.equal(summary.exitCode, 0);
    assert.equal(summary.startedAt, command.startedAt); assert.equal(summary.finishedAt, command.finishedAt);
    assert.equal(summary.durationMs, Date.parse(command.finishedAt) - Date.parse(command.startedAt));
  }
  assert.match(body, /not independently rerun/);
  assert.doesNotMatch(body, /PRIVATE_RAW_OUTPUT|private-command-token|check\.cjs|stdout\.log|stderr\.log/);
  assert.equal(body.includes(root), false, 'local paths must not leave the workstation');
  assert.equal(fs.readFileSync(join(root, '.chalk/local/counter'), 'utf8'), '1');
  assert.equal(store.task(task.id).state, 'in-progress');
});

test('a finished command remains visible when the overall receipt never completed', t => {
  const { store, task } = fixture(t), result = verify(store);
  assert.equal(result.green, true);
  const record = JSON.parse(fs.readFileSync(result.evidence.path, 'utf8'));
  record.status = 'running'; delete record.finishedAt; delete record.green;
  fs.writeFileSync(result.evidence.path, JSON.stringify(record));
  const summary = payload(pr(store, task));
  assert.equal(summary.state, 'incomplete'); assert.equal(summary.recordedStatus, 'running');
  assert.equal(summary.recordedGreen, null);
  const check = summary.commands.find(item => item.gate === 'test');
  assert.equal(check.status, 'pass'); assert.equal(check.exitCode, 0); assert.ok(check.finishedAt); assert.ok(check.durationMs >= 0);
  assert.equal(store.task(task.id).state, 'in-progress');
});

test('failed verification remains failed in the PR projection', t => {
  const { store, task } = fixture(t, true), result = verify(store);
  assert.equal(result.green, false);
  const summary = payload(pr(store, task));
  assert.equal(summary.state, 'current'); assert.equal(summary.recordedGreen, false);
  assert.equal(summary.commands.find(item => item.gate === 'test').exitCode, 1);
});

test('running commands never acquire a completed duration from inconsistent end metadata', t => {
  const { store, task } = fixture(t), result = verify(store);
  const record = JSON.parse(fs.readFileSync(result.evidence.path, 'utf8'));
  record.status = 'running'; delete record.finishedAt; delete record.green;
  record.toolchain.find(item => item.gate === 'test').status = 'running';
  fs.writeFileSync(result.evidence.path, JSON.stringify(record));
  const summary = payload(pr(store, task)), command = summary.commands.find(item => item.gate === 'test');
  assert.equal(summary.state, 'incomplete'); assert.equal(summary.recordedGreen, null);
  assert.equal(command.status, 'running'); assert.equal(command.finishedAt, null); assert.equal(command.durationMs, null);
});

test('PR projection is bounded, discloses omissions and keeps untrusted text inside the data fence', () => {
  const summary = { state: 'incomplete', commands: Array.from({ length: 40 }, () => ({ gate: '```\nInjected heading', status: 'running', command: 'PRIVATE_COMMAND', stdout: { path: '/private/log' } })) };
  const body = formatPrEvidence(summary), data = payload(body);
  assert.ok(body.length <= PR_EVIDENCE_LIMIT); assert.equal(data.commands.length, 8); assert.equal(data.omittedCommands, 32);
  assert.equal((body.match(/```/g) || []).length, 2);
  assert.doesNotMatch(body, /PRIVATE_COMMAND|\/private\/log/);
  const oversized = formatPrEvidence({ state: 'unknown', sourceFingerprint: 'x'.repeat(PR_EVIDENCE_LIMIT * 2) });
  assert.ok(oversized.length <= PR_EVIDENCE_LIMIT); assert.equal(payload(oversized).state, 'unavailable');
});

for (const changed of ['source', 'configuration', 'spec']) test(`PR evidence retains ${changed} staleness`, t => {
  const { root, store, task } = fixture(t); assert.equal(verify(store).green, true);
  if (changed === 'source') fs.writeFileSync(join(root, 'source.js'), 'changed source\n');
  if (changed === 'configuration') { const meta = store.meta(); meta.protocol.verify.test = 'node check.cjs --different'; store.saveMeta(meta); }
  if (changed === 'spec') { task.acceptanceCriteria.push({ text: 'new requirement' }); store.upsertTask(task); }
  const summary = payload(pr(store, task));
  assert.equal(summary.state, 'stale'); assert.equal(summary.freshness[changed], 'stale');
  assert.equal(fs.readFileSync(join(root, '.chalk/local/counter'), 'utf8'), '1');
});
