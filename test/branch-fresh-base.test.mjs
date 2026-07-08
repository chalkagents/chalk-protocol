// chalk branch cuts from the FRESH remote base (#150). After a squash-merge, `chalk merge` best-effort
// `pull --ff-only`s the primary base; if that fails (local base had commits) it only warns and still
// marks the task done — leaving the local base BEHIND the remote. The next `chalk branch` used to cut
// its worktree from that stale local base, branching the following task off old code. Now branch
// fetches and cuts from `origin/<base>` (source of truth), recovering the stale base; it falls back to
// the local base (with a warning when a remote exists) only when the remote ref can't be resolved.
// Locked contract for #150.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const sh = (cwd, cmd) => execSync(cmd, { cwd, encoding: 'utf8' });
const scratch = (p) => mkdtempSync(join(tmpdir(), p));
// A branchable pipeline task written straight into the spine.
const seedTask = (root) => {
  writeFileSync(join(root, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: next', state: 'specd', issue: { number: 5 },
    acceptanceCriteria: [{ text: 'c' }], tests: [], reviews: [], pipeline: { stage: 'selected', at: '2026-01-01T00:00:00Z' },
  }]));
};
const worktreeOf = (root) => JSON.parse(readFileSync(join(root, '.chalk/tasks.json'), 'utf8'))[0].worktree;

test('a stale local base is recovered — the worktree is cut from the remote tip, not the old local base', () => {
  const bare = scratch('bfb-bare-');
  execSync('git init -q --bare -b main', { cwd: bare });
  // Primary checkout: commit fileA, wire origin, push main.
  const work = scratch('bfb-work-');
  execSync('git init -q -b main && git config user.email t@t.t && git config user.name t', { cwd: work });
  writeFileSync(join(work, 'fileA.txt'), 'A\n');
  sh(work, `git add fileA.txt && git commit -q -m A && git remote add origin ${bare} && git push -q origin main`);
  // A DIFFERENT clone advances the remote (fileB) — the local base is now BEHIND origin/main.
  const other = scratch('bfb-other-');
  execSync(`git clone -q ${bare} ${other} && git -C ${other} config user.email t@t.t && git -C ${other} config user.name t`, { cwd: tmpdir() });
  writeFileSync(join(other, 'fileB.txt'), 'B\n');
  sh(other, 'git add fileB.txt && git commit -q -m B && git push -q origin main');

  chalk(work, 'init', '--name', 'p');
  const cfg = join(work, '.chalk/chalk.json');
  const c = JSON.parse(readFileSync(cfg, 'utf8')); c.protocol.github = { base: 'main' }; writeFileSync(cfg, JSON.stringify(c, null, 2));
  seedTask(work);

  const r = chalk(work, 'branch', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `branch must succeed: ${r.out}`);
  const wt = worktreeOf(work);
  assert.ok(wt && existsSync(wt), 'a worktree was created');
  // The recovery: fileB (remote-only, absent from the stale local main) is present → cut from origin/main.
  assert.ok(existsSync(join(wt, 'fileB.txt')), 'the worktree carries the remote-latest commit (fresh base, not the stale local one)');
});

test('a remote exists but origin/<base> is unresolvable — fall back to local base AND warn (never silently stale)', () => {
  const emptyBare = scratch('bfb-empty-'); // a remote with NO main ref → origin/main can't resolve
  execSync('git init -q --bare -b main', { cwd: emptyBare });
  const work = scratch('bfb-warn-');
  execSync('git init -q -b main && git config user.email t@t.t && git config user.name t', { cwd: work });
  writeFileSync(join(work, 'fileA.txt'), 'A\n');
  sh(work, `git add fileA.txt && git commit -q -m A && git remote add origin ${emptyBare}`); // remote wired, nothing pushed
  chalk(work, 'init', '--name', 'p');
  const cfg = join(work, '.chalk/chalk.json');
  const c = JSON.parse(readFileSync(cfg, 'utf8')); c.protocol.github = { base: 'main' }; writeFileSync(cfg, JSON.stringify(c, null, 2));
  seedTask(work);

  const r = chalk(work, 'branch', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `branch must still succeed by falling back to local base: ${r.out}`);
  assert.match(r.out, /may be stale|couldn't resolve/i, 'a remote exists but the base is unresolvable → it must WARN, not silently proceed');
  assert.ok(existsSync(join(worktreeOf(work), 'fileA.txt')), 'cut from the local base');
});

test('no remote configured — branch still works, falling back to the local base (no crash)', () => {
  const work = scratch('bfb-local-');
  execSync('git init -q -b main && git config user.email t@t.t && git config user.name t', { cwd: work });
  writeFileSync(join(work, 'fileA.txt'), 'A\n');
  sh(work, 'git add fileA.txt && git commit -q -m A');
  chalk(work, 'init', '--name', 'p');
  const cfg = join(work, '.chalk/chalk.json');
  const c = JSON.parse(readFileSync(cfg, 'utf8')); c.protocol.github = { base: 'main' }; writeFileSync(cfg, JSON.stringify(c, null, 2));
  seedTask(work);

  const r = chalk(work, 'branch', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `branch must fall back to the local base without a remote: ${r.out}`);
  const wt = worktreeOf(work);
  assert.ok(wt && existsSync(join(wt, 'fileA.txt')), 'the worktree is cut from the local base');
});
