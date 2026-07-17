// C2 (#210) — the executor contract for mid-flight raising. chalk raise (#209) exists, but the agent
// won't use it unless its contract tells it to, and tells it WHEN (a real fork needing the director's
// taste — not every micro-choice). This pins that the raise instruction reaches the executor via context
// AND is documented in both the shipped and dogfood chalk-executor definitions. Locked for task-622ec407.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

test('buildContext instructs the executor to raise a fork instead of guessing', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-raisec-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: a thing', state: 'in-progress', acceptanceCriteria: [{ text: 'works' }], tests: [],
  }]));
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /RAISE it — don't guess/i, 'the context carries the raise instruction');
  assert.match(out, /chalk raise "<the fork>"/, 'names the exact command');
  assert.match(out, /ONLY the few/i, 'and warns against raise-flooding (only the calls that need taste)');
});

test('the raise instruction is elastic — present at a normal budget, dropped under a tiny one (essentials survive)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-raiseE-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: a thing', state: 'in-progress', acceptanceCriteria: [{ text: 'UNIQUE_CRIT_ABC' }], tests: [],
  }]));
  assert.match(chalk(d, 'context', 'task-9f3a2b1c').out, /RAISE it/i, 'present at the default budget');
  // squeeze the budget so only essentials fit — the raise block (guidance) must yield first
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.contextBudget = 1; writeFileSync(cf, JSON.stringify(o, null, 2));
  const tiny = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.doesNotMatch(tiny, /RAISE it/i, 'the raise block yields under extreme pressure (deleting the raiseFits guard fails here)');
  assert.match(tiny, /UNIQUE_CRIT_ABC/, 'the acceptance criteria (essential) still survive');
});

test('both chalk-executor definitions document the raise convention (shipped + dogfood)', () => {
  for (const p of ['share/agents/chalk-executor.md', '.claude/agents/chalk-executor.md']) {
    const md = readFileSync(join(ROOT, p), 'utf8');
    assert.match(md, /Raise a fork instead of guessing/i, `${p}: has the raise section`);
    assert.match(md, /chalk raise "<the fork>"/, `${p}: names the command`);
    assert.match(md, /only the few/i, `${p}: warns against flooding`);
  }
});
