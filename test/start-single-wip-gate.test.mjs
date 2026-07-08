// One-at-a-time is a HARD start gate (#110 slice 4). Chalk's single-in-progress-task rule used to be
// a soft `chalk next` warning: `chalk start` silently allowed a second in-progress task, and the only
// tooth was verify() later going RED on its shared-cwd P6 check — a confusing downstream failure. Now
// `chalk start` refuses a second concurrent task up front unless parallel execution is explicitly
// enabled (protocol.parallel.enabled or --parallel), which is what the parallel machinery opts into.
// Locked contract for #110 slice 4.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const stateOf = (root, id) => JSON.parse(readFileSync(join(root, '.chalk/tasks.json'), 'utf8')).find((t) => t.id === id).state;

// A chalk spine with two ready (specd, criteria-bearing) tasks. `parallel` toggles the opt-in.
function repo({ parallel = false } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-wipgate-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  if (parallel) {
    const cfg = join(d, '.chalk/chalk.json');
    const c = JSON.parse(readFileSync(cfg, 'utf8'));
    c.protocol.parallel = { enabled: true };
    writeFileSync(cfg, JSON.stringify(c, null, 2));
  }
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a', state: 'specd', acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [] },
    { id: 'task-bbbbbbbb', title: 'feat: b', state: 'specd', acceptanceCriteria: [{ text: 'y' }], reviews: [], tests: [] },
  ]));
  return d;
}

test('start refuses a SECOND in-progress task when parallel is off, and does not move it', () => {
  const d = repo();
  assert.equal(chalk(d, 'start', 'task-aaaaaaaa').code, 0, 'the first start succeeds');
  const r = chalk(d, 'start', 'task-bbbbbbbb');
  assert.notEqual(r.code, 0, `a second concurrent start must be refused: ${r.out}`);
  assert.match(r.out, /in-progress/i, 'the error explains another task is already in-progress');
  assert.match(r.out, /parallel/i, 'the error points at the parallel opt-in');
  assert.match(r.out, /task-aaaaaaa/, 'the error names the blocking task (12-char short id)');
  assert.equal(stateOf(d, 'task-bbbbbbbb'), 'specd', 'the refused task stays specd — not started');
});

test('start allows a second in-progress task when protocol.parallel.enabled is set', () => {
  const d = repo({ parallel: true });
  assert.equal(chalk(d, 'start', 'task-aaaaaaaa').code, 0);
  const r = chalk(d, 'start', 'task-bbbbbbbb');
  assert.equal(r.code, 0, `parallel mode must allow a concurrent start: ${r.out}`);
  assert.equal(stateOf(d, 'task-bbbbbbbb'), 'in-progress', 'the second task is now in-progress');
});

test('the --parallel flag also opts in without touching config', () => {
  const d = repo();
  assert.equal(chalk(d, 'start', 'task-aaaaaaaa').code, 0);
  assert.equal(chalk(d, 'start', 'task-bbbbbbbb', '--parallel').code, 0, 'the --parallel flag overrides the gate');
  assert.equal(stateOf(d, 'task-bbbbbbbb'), 'in-progress');
});

test('the gate does NOT fire for the first task, nor when re-running start on the same task', () => {
  const d = repo();
  assert.equal(chalk(d, 'start', 'task-aaaaaaaa').code, 0, 'first task starts freely');
  const again = chalk(d, 'start', 'task-aaaaaaaa');
  assert.equal(again.code, 0, `re-starting the SAME in-progress task must not be gated: ${again.out}`);
  assert.equal(stateOf(d, 'task-aaaaaaaa'), 'in-progress');
});
