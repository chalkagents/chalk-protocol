import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline } from '../lib/pipeline.mjs';

function fixture(mode) {
  const root = mkdtempSync(join(tmpdir(), 'chalk-review-pipeline-'));
  const calls = join(root, 'calls.jsonl');
  const cli = join(root, 'cli.mjs');
  writeFileSync(cli, `
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const calls = ${JSON.stringify(calls)}, mode = ${JSON.stringify(mode)}, command = process.argv[2];
appendFileSync(calls, JSON.stringify(process.argv.slice(2)) + '\\n');
if (command === 'review') {
  const prior = existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\\n').map(JSON.parse).filter(x => x[0] === 'review').length : 1;
  process.exit(mode === 'transient-then-pass' && prior === 1 ? 4 : mode === 'transient-then-pass' ? 0 : 1);
}
process.exit(0);
`);
  const task = { id: 'task-review-policy', title: 'review policy', issue: { number: 7 }, state: 'in-progress', reviews: [] };
  const store = {
    root,
    protocol: () => ({ review: { command: 'configured-reviewer' }, github: {}, e2e: {} }),
    tasks: () => [task],
    task: () => task,
  };
  return { root, calls, cli, store };
}

const reviewCalls = file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(args => args[0] === 'review');

test('pipeline does not retry a terminal reviewer failure', () => {
  const f = fixture('terminal');
  const result = runPipeline(f.store, f.cli);
  assert.deepEqual(result.blocked, ['task-review-policy']);
  assert.equal(reviewCalls(f.calls).length, 1);
});

test('pipeline retries only the distinct transient reviewer exit once', () => {
  const f = fixture('transient-then-pass');
  const result = runPipeline(f.store, f.cli);
  assert.deepEqual(result.merged, ['task-review-policy']);
  assert.equal(reviewCalls(f.calls).length, 2);
  assert.ok(reviewCalls(f.calls).every(args => args.includes('--no-retry')), 'the pipeline owns the one outer retry');
});
