// B2 (#202) — the compounding moat. The durable director record (#201) now feeds FORWARD: buildContext
// injects a bounded "Director's calls so far" block so the agent applies the human's past accept/redirect
// taste on new work and the same fork stops recurring. Accepted → "apply this rationale"; redirected →
// "do this instead" (the distinction B1 split the schema for). Bounded like lessons; off when empty.
// Locked for task-6fec5f3f.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

function repo(records = []) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-compound-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: a NEW task', state: 'in-progress',
    acceptanceCriteria: [{ text: 'the new work' }], tests: [],
  }]));
  for (const r of records) appendFileSync(join(d, '.chalk/director.jsonl'), JSON.stringify(r) + '\n');
  return d;
}

test('buildContext injects the Director\'s calls block — accepted shows rationale, redirected shows instruction', () => {
  const d = repo([
    { at: '2026-01-01', verdict: 'accepted', choice: 'opt-in default off', rationale: 'no regression', taskId: 'task-old1', by: 'human' },
    { at: '2026-01-02', verdict: 'redirected', choice: 'a global singleton', instruction: 'use dependency injection', taskId: 'task-old2', by: 'human' },
  ]);
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /Director's calls so far/i, 'the compounding block renders on a new task');
  assert.match(out, /accepted: "opt-in default off" \(because no regression\)/, 'accepted call applies the AGENT rationale');
  assert.match(out, /redirected: "a global singleton" → use dependency injection/, 'redirected call carries the DIRECTOR instruction');
});

test('the compounding block is PRIOR taste — the current task\'s OWN decision is not echoed here', () => {
  const d = repo([
    { at: 'x', verdict: 'accepted', choice: 'other task choice', rationale: 'good', taskId: 'task-other', by: 'human' },   // a PRIOR task
    { at: 'y', verdict: 'redirected', choice: 'this task choice', instruction: 'do X', taskId: 'task-9f3a2b1c', by: 'human' }, // the CURRENT task
  ]);
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /other task choice/, "a PRIOR task's call compounds into this task");
  assert.doesNotMatch(out, /this task choice/, "the current task's own call is NOT re-listed here (it rides the essential Director corrections block instead)");
});

test('no director calls → no block (no regression to existing context)', () => {
  const out = chalk(repo([]), 'context', 'task-9f3a2b1c').out;
  assert.doesNotMatch(out, /Director's calls so far/i);
});

test('bounded — under a tight budget the newest calls are kept and older ones elided; essentials survive', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    at: `2026-02-${String(i + 1).padStart(2, '0')}`, verdict: 'accepted',
    choice: `decision number ${i} with enough text to consume some real budget`, rationale: 'because reasons', by: 'human',
  }));
  const d = repo(many);
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.contextBudget = 900; writeFileSync(cf, JSON.stringify(o, null, 2));
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /decision number 24/, 'the NEWEST director call is kept under pressure');
  assert.match(out, /director call\(s\) elided/i, 'older calls are elided with a note, not silently dropped');
  assert.match(out, /the new work/, 'the task acceptance criteria (essential) are never displaced');
});

test('director block and lessons COEXIST — director ranks first, lessons are NOT dropped (priority, not exclusion)', () => {
  const d = repo([{ at: '2026-01-01', verdict: 'accepted', choice: 'a director call', rationale: 'taste', by: 'human' }]);
  chalk(d, 'lesson', 'add', 'an auto-collected lesson to keep');
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /Director's calls so far/i, 'director block present');
  assert.match(out, /an auto-collected lesson to keep/, 'lessons are NOT dropped just because director decisions exist');
  assert.ok(out.indexOf("Director's calls so far") < out.indexOf('Lessons learned'),
    'director calls (explicit human taste) rank ahead of auto-collected lessons');
});
