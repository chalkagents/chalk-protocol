// Per-worktree P6 integrity (#110 slice 1). verify()'s integrity check hashed EVERY in-progress
// task's locked tests against a single shared cwd — so two tasks in-progress on different branches
// each miss the other's locked test in this checkout, firing a false break and RED-ing both. That
// single-cwd tooth is what forced whole-repo sequential sweeps even for independent tasks. The fix
// scopes the check per task: each in-progress task's locks are hashed in ITS OWN worktree
// (task.worktree, falling back to store.root). The DONE-task all-locks loop stays at cwd — that is
// the #80 anti-cheat catching the current worktree weakening an already-done task's locked test.
// Locked contract for #110 slice 1.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
// A chalk spine (no verify toolchain configured → toolchain is all-skip/green, so integrity decides).
function spine(mutateProto) {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-p6wt-')));
  execSync('git init -q', { cwd: d });
  spawnSync('node', [CLI, 'init', '--name', 'p'], { cwd: d, encoding: 'utf8' });
  if (mutateProto) {
    const cfg = join(d, '.chalk/chalk.json');
    const proto = JSON.parse(readFileSync(cfg, 'utf8'));
    mutateProto(proto);
    writeFileSync(cfg, JSON.stringify(proto, null, 2));
  }
  return d;
}
// Write `body` to <root>/<rel>, creating parent dirs. Returns the abs path.
function put(root, rel, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

test('two in-progress tasks in separate worktrees do NOT false-break each other (the sequential tooth)', () => {
  const d = spine();
  // Each task's locked test exists ONLY in its own worktree — the whole point of worktree isolation.
  const wtA = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-wtA-')));
  const wtB = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-wtB-')));
  const aTest = put(wtA, 'test/a.test.mjs', 'export const a = 1;\n');
  const bTest = put(wtB, 'test/b.test.mjs', 'export const b = 2;\n');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', worktree: wtA, acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: 'test/a.test.mjs', sha256: sha(aTest) }] },
    { id: 'task-bbbbbbbb', title: 'feat: b', state: 'in-progress', worktree: wtB, acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: 'test/b.test.mjs', sha256: sha(bTest) }] },
  ]));
  const store = new Store(d);
  // Verify from task A's worktree. Under the old shared-cwd check, task B's lock is hashed against
  // wtA (where test/b.test.mjs does not exist) → false break → integrityGreen false.
  const v = verify(store, { cwd: wtA });
  assert.equal(v.integrityGreen, true, `each task must be checked in its own worktree, no false break: ${JSON.stringify(v.integrity)}`);
  assert.equal(v.green, true, 'no toolchain configured + no integrity break → green');
});

test('a GENUINE integrity break in a task is still caught in its own worktree', () => {
  const d = spine();
  const wtA = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-wtA2-')));
  const aTest = put(wtA, 'test/a.test.mjs', 'export const a = 1;\n');
  const lockedSha = sha(aTest);
  writeFileSync(aTest, 'export const a = 999; // weakened\n'); // tamper AFTER locking
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', worktree: wtA, acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: 'test/a.test.mjs', sha256: lockedSha }] },
  ]));
  const v = verify(new Store(d), { cwd: wtA });
  assert.equal(v.integrityGreen, false, 'a modified locked test in the task worktree must still break P6');
});

test('all-locks: a DONE task test tampered in the current worktree is still caught (#80 anti-cheat at cwd)', () => {
  const d = spine((cfg) => { cfg.protocol.integrity = 'all-locks'; });
  const wtCur = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-cur-')));
  // The done task's locked test is PRISTINE at the spine root (as merged), but the CURRENT worktree
  // carries a weakened copy — the ImpossibleBench one-task-removed cheat. The done-loop must hash at
  // cwd (the worktree), not the done task's own root, or the tamper slips through.
  const rootCopy = put(d, 'test/done.test.mjs', 'export const d = 1;\n');
  const lockedSha = sha(rootCopy);
  put(wtCur, 'test/done.test.mjs', 'export const d = 0; // weakened in the current worktree\n');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-dddddddd', title: 'feat: done', state: 'done', acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: 'test/done.test.mjs', sha256: lockedSha }] },
  ]));
  const v = verify(new Store(d), { cwd: wtCur });
  assert.equal(v.integrityGreen, false, 'a done task test weakened in the current worktree must break P6 (anti-cheat checks cwd)');
});
