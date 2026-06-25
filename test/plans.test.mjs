// Tests for the Chalk Browser bridge: tasks.json → canonical .chalk/plans/ kanban.
// Drives the real CLI, then reads the projected plan files the way chalk-browser's
// plans.ts would. Zero deps — `node --test`.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
function chalk(cwd, ...args) {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-plans-'));
const tid = (d, i = 0) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[i].id.slice(0, 12);

// Mini frontmatter reader mirroring plans.ts: pull a top-level scalar / count todos.
const planPath = (d, col, file) => join(d, '.chalk/plans', col, file);
function fmValue(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!m) return undefined;
  try { return JSON.parse(m[1]); } catch { return m[1].trim(); }
}
const countTodos = (content) => (content.match(/^\s+- id:/gm) || []).length;
// Files we generated all carry the ownership marker.
const isOurs = (content) => content.includes('generator: chalk-protocol');

test('plans — projects each task into its state column with stable frontmatter', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  chalk(d, 'task', 'add', 'First feature');
  const id0 = tid(d);
  chalk(d, 'spec', id0, '--criterion', 'does A', '--criterion', 'does B');
  chalk(d, 'task', 'add', 'Second feature'); // stays plain todo (no criteria)

  assert.equal(chalk(d, 'plans').code, 0);

  // Task 0 is specd → todo column, file prefixed 01_, todos = 2 criteria.
  const f0 = planPath(d, 'todo', '01_first_feature.plan.md');
  assert.ok(existsSync(f0), 'specd task projected into todo/');
  const c0 = readFileSync(f0, 'utf8');
  assert.equal(fmValue(c0, 'name'), 'First feature');
  assert.equal(fmValue(c0, 'id'), JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id);
  assert.equal(countTodos(c0), 2, 'acceptance criteria become todos');
  assert.ok(isOurs(c0), 'carries the generator marker');

  // Task 1 (plain todo) also lands in todo/ with prefix 02_.
  assert.ok(existsSync(planPath(d, 'todo', '02_second_feature.plan.md')), 'plain todo projected');
});

test('plans — state transitions move the card and leave no stragglers', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  chalk(d, 'task', 'add', 'Movable');
  const id0 = tid(d);
  chalk(d, 'spec', id0, '--criterion', 'c1');
  // Auto-sync on `spec` already wrote to todo/.
  assert.ok(existsSync(planPath(d, 'todo', '01_movable.plan.md')), 'starts in todo/');

  chalk(d, 'start', id0); // → in-progress, auto-syncs
  assert.ok(existsSync(planPath(d, 'inprogress', '01_movable.plan.md')), 'moved to inprogress/');
  assert.ok(!existsSync(planPath(d, 'todo', '01_movable.plan.md')), 'old todo/ copy swept away (no duplicate card)');
});

const board = (d) => JSON.parse(readFileSync(join(d, '.chalk/boards/chalk-protocol.board.json'), 'utf8'));

test('board — projects one card per task with the locked test wired into testArtifact', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'sum.test.mjs'), "console.log('ok');");
  chalk(d, 'task', 'add', 'Wire a feature');
  const id0 = tid(d);
  chalk(d, 'spec', id0, '--criterion', 'does the thing', '--test', 'sum.test.mjs');
  chalk(d, 'start', id0); // → in-progress

  const b = board(d);
  assert.equal(b.cards.length, 1);
  const card = b.cards[0];
  assert.equal(card.id, JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id, 'card id is the stable task id');
  assert.equal(card.column, 'in_progress', 'board uses in_progress (underscore), not the plans folder name');
  assert.equal(card.testArtifact.specPath, 'sum.test.mjs', 'locked acceptance test wired into testArtifact');
  assert.equal(typeof card.createdAt, 'number', 'board timestamps are epoch ms (boards.ts shape)');
});

test('board — done task records a passed run; board id is stable across re-projection', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'sum.test.mjs'), "console.log('ok');");
  // Configure verify so `done` can pass, then drive a task to done.
  const cfgPath = join(d, '.chalk/chalk.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.protocol.verify.test = 'node sum.test.mjs';
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  chalk(d, 'task', 'add', 'Finish it');
  const id0 = tid(d);
  chalk(d, 'spec', id0, '--criterion', 'c1', '--test', 'sum.test.mjs');
  chalk(d, 'start', id0);
  assert.equal(chalk(d, 'done', id0).code, 0, 'done succeeds (verify green)');

  const before = board(d);
  assert.equal(before.cards[0].column, 'done');
  assert.equal(before.cards[0].testArtifact.lastRun.status, 'passed', 'done implies a passed run (P4)');

  // Re-project explicitly — same board id (so the Browser updates, never duplicates the board).
  chalk(d, 'sync');
  assert.equal(board(d).id, before.id, 'board id is deterministic across runs');
});

test('plans — regeneration is idempotent and preserves hand-authored plans', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'demo');
  chalk(d, 'task', 'add', 'Generated task');
  chalk(d, 'plans');

  // Drop a hand-authored plan (no marker) alongside the generated ones.
  const handDir = join(d, '.chalk/plans/todo');
  mkdirSync(handDir, { recursive: true });
  const hand = join(handDir, '99_hand_written.plan.md');
  writeFileSync(hand, '---\nname: "Hand written"\n---\n\n# Hand written\n');

  const r2 = chalk(d, 'plans');
  assert.equal(r2.code, 0);
  // Idempotent: re-running removed exactly the 1 plan we generated last time, not the hand plan.
  assert.match(r2.out, /1 stale plan\(s\) removed/);
  assert.ok(existsSync(hand), 'hand-authored plan left untouched');
  assert.ok(!isOurs(readFileSync(hand, 'utf8')), 'hand plan still unmarked');
  assert.ok(existsSync(planPath(d, 'todo', '01_generated_task.plan.md')), 'generated plan rewritten');
});
