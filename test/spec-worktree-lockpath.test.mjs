// Worktree-safe lock paths (#111). `chalk spec/amend-spec --test <path>` is the sanctioned way to
// (re)lock a test, and the reviewer's "not registered as a locked test" block pushes you to run it
// from the task's WORKTREE (so the file exists at cwd). But the lock path was recorded relative to
// `store.root` — the MAIN checkout — so a cwd inside a linked worktree produced `../<worktree>/…/x`,
// which ENOENTs the moment `chalk merge` cleans the worktree up, even though the file exists on main.
// The fix records the path relative to the WORKTREE's copy of the project root — tree-relative
// (`test/x.mjs`), valid in every checkout. This suite pins both directions. Locked contract for #111.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const tasks = (root) => JSON.parse(readFileSync(join(root, '.chalk/tasks.json'), 'utf8'));
// A git repo with a chalk spine and one in-progress task, committed so a worktree can branch from HEAD.
function mainRepo() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-wtlock-')));
  execSync('git init -q -b main && git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  const id = 'task-11111111';
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id, title: 'feat: a', state: 'in-progress', startedAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [],
  }]));
  execSync('git add -A && git commit -q -m init', { cwd: d });
  return { d, id };
}

test('spec --test from a linked worktree records a tree-relative path (not ../<worktree>/…) that survives cleanup', () => {
  const { d, id } = mainRepo();
  // A linked worktree branched off main — the shape `chalk branch` produces (a sibling code sandbox).
  const wtDir = join(dirname(d), `${basename(d)}-wt`);
  execSync(`git worktree add -q -b feat/x "${wtDir}" main`, { cwd: d });
  const wt = realpathSync(wtDir);
  mkdirSync(join(wt, 'test'), { recursive: true });
  const body = 'export const t = 1;\n';
  writeFileSync(join(wt, 'test/foo.test.mjs'), body);

  // Run the sanctioned lock FROM the worktree — chalk redirects to the single canonical spine (#52).
  const r = chalk(wt, 'spec', id, '--test', 'test/foo.test.mjs');
  assert.equal(r.code, 0, r.out);

  const locked = tasks(d).find((t) => t.id === id).tests;
  assert.equal(locked.length, 1, 'the test was locked into the canonical spine');
  const p = locked[0].path;
  assert.equal(p, 'test/foo.test.mjs', 'the lock path is tree-relative, valid in every checkout');
  assert.ok(!p.startsWith('..') && !p.includes(basename(wt)), `must not point into the worktree: ${p}`);

  // Criterion 2 — it resolves under the CANONICAL root once the file lands there (post-merge). Put the
  // same content on main, then brokenLocks (canonical base) must report NO integrity break.
  mkdirSync(join(d, 'test'), { recursive: true });
  writeFileSync(join(d, 'test/foo.test.mjs'), body);
  const store = new Store(d);
  const task = store.tasks().find((t) => t.id === id);
  assert.deepEqual(store.brokenLocks(task), [], 'the recorded path resolves + matches under the canonical root');
});

test('spec --test from the canonical root is unchanged — path is relative to the spine root', () => {
  const { d, id } = mainRepo();
  mkdirSync(join(d, 'test'), { recursive: true });
  writeFileSync(join(d, 'test/bar.test.mjs'), 'export const t = 2;\n');
  const r = chalk(d, 'spec', id, '--test', 'test/bar.test.mjs');
  assert.equal(r.code, 0, r.out);
  assert.equal(tasks(d).find((t) => t.id === id).tests[0].path, 'test/bar.test.mjs', 'unchanged: tree-relative == spine-root-relative here');
});
