// Planner scoping questions — the planner doesn't just emit a plan, it surfaces what it's UNSURE
// about so a human can validate scope before any code is written. extractQuestions tolerantly pulls
// those from the plan text; `chalk plan` records them as open questions for the human to answer.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractQuestions } from '../lib/planning.mjs';

test('extractQuestions — pulls a Questions section and inline Q:/QUESTION: lines', () => {
  const plan = `## Plan
1. Build the parser
2. Wire it up

## Open Questions
- Which database should back the store?
- [ ] Should auth be required for read endpoints?

Q: What is the expected payload size?
QUESTION: Do we support pagination?`;
  const qs = extractQuestions(plan);
  assert.deepEqual(qs, [
    'Which database should back the store?',
    'Should auth be required for read endpoints?',
    'What is the expected payload size?',
    'Do we support pagination?',
  ]);
});

test('extractQuestions — trims, dedupes, drops empties; none → []', () => {
  assert.deepEqual(extractQuestions('## Plan\njust do it, no open questions'), []);
  assert.deepEqual(extractQuestions(''), []);
  const dup = `## Questions\n- Same?\n- Same?\n-   \nQ: Same?`;
  assert.deepEqual(extractQuestions(dup), ['Same?'], 'deduped + empties dropped');
});

test('chalk plan — records planner questions as open questions tied to the task', () => {
  const d = mkdtempSync(join(tmpdir(), 'planning-'));
  const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
  const chalk = (...a) => spawnSync('node', [CLI, ...a], { cwd: d, encoding: 'utf8' });
  chalk('init', '--name', 'd');
  // a stub planner that emits a plan WITH a questions section
  const planner = join(d, 'planner.mjs');
  writeFileSync(planner, `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log('## Plan\\nDo X\\n\\n## Questions\\n- Which DB?\\n- Which auth method?'));`);
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f)); o.protocol.planner = { command: `node ${planner}` }; writeFileSync(f, JSON.stringify(o, null, 2));
  chalk('task', 'add', 'T');
  const id = JSON.parse(readFileSync(join(d, '.chalk/tasks.json')))[0].id.slice(0, 12);
  chalk('spec', id, '--criterion', 'x');

  const r = chalk('plan', id);
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /2 .*question/i, 'reports the count of scoping questions');
  const qs = JSON.parse(readFileSync(join(d, '.chalk/questions.json')));
  assert.equal(qs.length, 2);
  assert.deepEqual(qs.map((q) => q.question), ['Which DB?', 'Which auth method?']);
  assert.ok(qs.every((q) => q.status === 'open' && q.awaitingFrom === 'human' && q.taskId), 'open, awaiting human, tied to the task');
});
