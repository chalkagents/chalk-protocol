// A2 (#199) — inject director corrections into the executor's context. A1 (#198) re-opens a redirected
// task with a durable directive, but the executor's next `chalk work` can only rebuild to the
// correction if it SEES it. buildContext already surfaces prior review findings; this adds a parallel,
// ESSENTIAL "Director corrections" block for the task's unresolved directives, so the agent rebuilds to
// the director's call instead of repeating its own. Locked for task-fc11b71e.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

function repo(task) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-ctxinj-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', state: 'in-progress',
    acceptanceCriteria: [{ text: 'works' }], tests: [], ...task,
  }]));
  return d;
}

test('buildContext surfaces an unresolved directive as a Director corrections block', () => {
  const d = repo({ directives: [
    { choice: 'process-global cache', instead: 'use an LRU with a size cap', at: 'x', by: 'human', resolved: false },
  ] });
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /Director corrections/i, 'the block renders');
  assert.match(out, /REBUILD to these/i, 'framed as a rebuild instruction');
  assert.match(out, /Instead of "process-global cache": use an LRU with a size cap/, 'names the choice and the correction');
});

test('a RESOLVED directive is not injected (only pending corrections)', () => {
  const d = repo({ directives: [
    { choice: 'process-global cache', instead: 'use an LRU', at: 'x', by: 'human', resolved: true },
  ] });
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.doesNotMatch(out, /Director corrections/i, 'resolved directives are done — not re-surfaced');
});

test('no directives → no block (no regression to existing context)', () => {
  const out = chalk(repo({}), 'context', 'task-9f3a2b1c').out;
  assert.doesNotMatch(out, /Director corrections/i);
});

test('the corrections block is ESSENTIAL — it survives a tiny context budget (lessons get elided, not this)', () => {
  const d = repo({ directives: [{ choice: 'X', instead: 'do Y instead', at: 'x', by: 'human', resolved: false }] });
  // pile up lessons so the elastic block is under pressure, then squeeze the budget hard
  for (let i = 0; i < 20; i++) chalk(d, 'lesson', 'add', `filler lesson number ${i} with enough text to matter`);
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.contextBudget = 400; writeFileSync(cf, JSON.stringify(o, null, 2));
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /do Y instead/, 'the director correction is kept even under a tiny budget');
  assert.match(out, /elided/i, 'while lessons are the block that gets trimmed');
});
