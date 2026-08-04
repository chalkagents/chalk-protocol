// Every remaining agent-backed role goes through Agent Runner. One fake command seam drives the
// role parsers, fallback behavior, usage accounting, and the regression-author CLI wiring.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReview } from '../lib/review.mjs';
import { runDiscovery } from '../lib/discovery.mjs';
import { runFeedback } from '../lib/feedback.mjs';
import { runRetro } from '../lib/retro.mjs';
import { writeHandoff } from '../lib/handoff.mjs';
import { prNarrative } from '../lib/prbody.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const FAKE = join(ROOT, 'examples', 'agent-runner', 'fake-raw-agent.mjs');
const fake = (role) => `${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} ${role}`;

function fakeStore(root) {
  const costs = [];
  const protocol = {
    review: { command: fake('reviewer-nonzero') },
    discovery: { command: fake('discovery') },
    feedback: { command: fake('feedback') },
    retro: { command: fake('retro') },
    handoff: { command: fake('handoff') },
    prbody: { command: fake('pr-narrative') },
    github: {},
  };
  return {
    root, costs,
    protocol: () => protocol,
    meta: () => ({ project: { description: 'fake project' }, protocol }),
    updates: () => [], tasks: () => [], lessons: () => [],
    logCost: (record) => costs.push(record),
    upsertTask() {}, emitUpdate() {},
  };
}

test('reviewer, discovery, feedback, retro, handoff, and PR narrative share Agent Runner', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-agent-roles-'));
  execSync('git init -q', { cwd: d });
  execSync('git config user.email fake@example.com', { cwd: d });
  execSync('git config user.name Fake', { cwd: d });
  writeFileSync(join(d, 'change.txt'), 'before\n');
  execSync('git add change.txt', { cwd: d });
  execSync('git commit -qm baseline', { cwd: d });
  writeFileSync(join(d, 'change.txt'), 'after\n');

  const store = fakeStore(d);
  const task = { id: 'task-fake0001', title: 'fake task', state: 'in-progress', acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [] };

  const review = runReview(store, task);
  assert.equal(review.status, 'ok', 'a valid verdict survives a non-zero adapter exit');
  assert.equal(review.verdict, 'pass');
  assert.equal(runDiscovery(store, 'brief').tasks[0].title, 'fake task');
  assert.equal(runFeedback(store, 'signals').issues[0].title, 'fake issue');
  assert.deepEqual(runRetro(store).lessons, ['fake lesson']);
  const handoff = writeHandoff(store, task, { reason: 'fake reason' });
  assert.match(readFileSync(join(d, handoff.path), 'utf8'), /fake handoff narrative/);
  assert.equal(prNarrative(store, task, ['change.txt']), 'fake pull-request narrative');

  assert.deepEqual(store.costs.map((record) => record.stage), ['review', 'discovery', 'feedback', 'retro', 'handoff', 'pr-narrative']);
  for (const record of store.costs) {
    assert.ok(record.ms >= 0, `${record.stage} records wall time`);
    assert.deepEqual(record.tokens, { in: 12, out: 5, cacheRead: 3, cacheWrite: 2 }, `${record.stage} records normalized usage`);
  }
});

test('chalk guard gen routes regression authoring through Agent Runner and records the call', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-agent-guard-'));
  const chalk = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: d, encoding: 'utf8' });
  assert.equal(chalk('init', '--name', 'guard-runner').status, 0);
  const configFile = join(d, '.chalk', 'chalk.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.protocol.regression.dir = 'guard-output';
  config.protocol.regression.authorCommand = fake('regression-author');
  writeFileSync(configFile, JSON.stringify(config, null, 2));

  const generated = chalk('guard', 'gen');
  assert.equal(generated.status, 0, `${generated.stdout}${generated.stderr}`);
  assert.ok(existsSync(join(d, 'guard-output', 'fake-guard.test.mjs')), 'the fake author wrote through its role request');
  const ledger = readFileSync(join(d, '.chalk', 'local', 'cost.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(ledger.at(-1).stage, 'regression-author');
  assert.equal(ledger.at(-1).agent, 'regression-author');
});

test('agent workflows contain no duplicate provider-aware execution path', () => {
  const files = ['review.mjs', 'discovery.mjs', 'feedback.mjs', 'retro.mjs', 'handoff.mjs', 'prbody.mjs'];
  for (const file of files) {
    const source = readFileSync(join(ROOT, 'lib', file), 'utf8');
    assert.match(source, /runAgent\(/, `${file} calls the shared seam`);
    assert.doesNotMatch(source, /withJsonOutput|unwrapAgentOutput|runExecutorCaptured|withRunner/, `${file} has no provider/transport duplicate`);
  }
  const regression = readFileSync(join(ROOT, 'lib', 'regression.mjs'), 'utf8');
  assert.match(regression, /runAgent\('regression-author'/);
  assert.match(readFileSync(CLI, 'utf8'), /runRegressionAuthor\(s, reg\.authorCommand, prompt\)/);
});
