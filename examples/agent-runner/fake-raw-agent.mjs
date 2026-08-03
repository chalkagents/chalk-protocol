#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fixture = process.argv[2] || 'text';
const input = readFileSync(0, 'utf8');

const roleOutput = {
  reviewer: JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }),
  'reviewer-nonzero': JSON.stringify({ verdict: 'pass', findings: [], decisions: [] }),
  discovery: JSON.stringify({ spec: 'fake spec', tasks: [{ title: 'fake task', criteria: ['fake criterion'] }] }),
  feedback: JSON.stringify({ issues: [{ title: 'fake issue', body: 'fake body', severity: 'low' }] }),
  retro: JSON.stringify({ lessons: ['fake lesson'], issues: [] }),
  handoff: 'fake handoff narrative',
  'pr-narrative': 'fake pull-request narrative',
};

function emitRole(text) {
  process.stdout.write(JSON.stringify({
    type: 'result', result: text,
    usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
    total_cost_usd: 0.04, num_turns: 1,
  }) + '\n');
}

if (fixture === 'timeout') {
  setTimeout(() => process.stdout.write('too late\n'), 30_000);
} else if (fixture === 'nonzero') {
  process.stdout.write('partial fake output\n');
  process.exitCode = 23;
} else if (fixture === 'malformed-envelope') {
  process.stdout.write('{"type":"result","result":\n');
} else if (fixture === 'usage') {
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'usage-aware fake output',
    usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
    total_cost_usd: 0.04,
    num_turns: 1,
  }) + '\n');
} else if (fixture === 'regression-author') {
  const target = (input.match(/Write test files into\n([^\n]+)\//) || [])[1] || 'guard-output';
  mkdirSync(target, { recursive: true });
  writeFileSync(`${target}/fake-guard.test.mjs`, "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('fake guard', () => assert.ok(true));\n");
} else if (Object.hasOwn(roleOutput, fixture)) {
  emitRole(roleOutput[fixture]);
  if (fixture === 'reviewer-nonzero') process.exitCode = 17;
} else {
  process.stdout.write(`fake output: ${input}`);
}
