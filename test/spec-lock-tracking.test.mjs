// Spec-lock tracking gate (#107) — the sha256 pin verifies a locked test against the WORKING TREE
// only, so a pinned test that was never `git add`ed passes every local gate while CI and any fresh
// checkout run WITHOUT the contract test: a vacuous green. Three consecutive reviews had to flag
// this by hand. Now `chalk done` (and `chalk pr`) refuse when a pinned locked-test path is
// untracked, name the offending file(s), and suggest the fix; tracking the file opens the gate
// again. In a non-git tree tracking is unverifiable, so the gate stays out of the way. Locked
// contract for the task tracking issue #107 (dupe: #113).
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// A spine with one in-progress task whose locked test exists ON DISK with a matching sha256 pin —
// but is untracked. Verify is unconfigured (vacuous green) and review is not required, so the
// tracking gate is the ONLY thing standing between this task and `done`.
function repoWithUntrackedPin({ gitInit = true } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-lock-'));
  if (gitInit) execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'contract.test.mjs'), "import { test } from 'node:test'; test('pinned', () => {});\n");
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', startedAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [],
    tests: [{ path: 'contract.test.mjs', sha256: sha(join(d, 'contract.test.mjs')) }],
  }]));
  return d;
}

test('chalk done — refuses an untracked pinned test, names it, suggests the fix; tracking it opens the gate', () => {
  const d = repoWithUntrackedPin();
  const blocked = chalk(d, 'done', 'task-aaaaaaaa');
  assert.notEqual(blocked.code, 0, `an untracked pinned test must block done: ${blocked.out}`);
  assert.match(blocked.out, /contract\.test\.mjs/, 'the offending path is named');
  assert.match(blocked.out, /not tracked|untracked/i, 'says WHY it blocked');
  assert.match(blocked.out, /git add contract\.test\.mjs/, 'suggests the exact fix');
  // The task must NOT have been marked done on the way out.
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'in-progress');
  // Track the file — the same command now succeeds (staged counts as tracked; ls-files sees it).
  execSync('git add contract.test.mjs', { cwd: d });
  const done = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(done.code, 0, `a tracked pinned test must pass the gate: ${done.out}`);
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'done');
});

test('chalk pr — refuses to push a branch whose pinned test is untracked', () => {
  const d = repoWithUntrackedPin();
  // Give the task a branch so `pr` reaches the tracking gate (it checks before pushing).
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks[0].branch = 'feat/1-a';
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'pr', 'task-aaaaaaaa');
  assert.notEqual(r.code, 0, `pr must refuse before pushing: ${r.out}`);
  assert.match(r.out, /contract\.test\.mjs/, 'the offending path is named');
  assert.match(r.out, /git add contract\.test\.mjs/, 'suggests the fix');
  assert.doesNotMatch(r.out, /git push failed|pr create/i, 'the gate fires BEFORE any push attempt');
});

test('non-git tree — tracking is unverifiable, the gate stays out of the way', () => {
  const d = repoWithUntrackedPin({ gitInit: false });
  const r = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `done must not block on tracking outside git: ${r.out}`);
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'done');
});
