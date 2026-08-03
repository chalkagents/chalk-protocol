#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const fixture = process.argv[2] || 'text';
const input = readFileSync(0, 'utf8');

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
} else {
  process.stdout.write(`fake output: ${input}`);
}
