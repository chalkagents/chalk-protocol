// `chalk commit` commits follow-up changes, not just the first round (#134). The old guard returned
// "commit (already done)" whenever the task was past its `committed` stage — so code changes made
// AFTER the first commit (the NORMAL review→fix loop after a `chalk review` BLOCK) stayed
// uncommitted. That is a gate-integrity hole: the adversarial reviewer judges the WORKING TREE
// (`git diff HEAD`) and can PASS, but `chalk merge` squash-takes only COMMITTED changes — so a green
// review can certify code that never lands (this shipped #114 half-incomplete). Now `chalk commit`
// commits new working-tree changes even past the committed stage (a labeled follow-up), and only
// no-ops when there is genuinely nothing new. This suite pins: the first commit lands, a follow-up
// commit lands the review-fix change into git (working tree == committed), and a truly-clean re-run
// is an idempotent no-op. Locked contract for the task tracking issue #134.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

// A working repo whose origin is a local bare repo; worktree isolation off (commit in the primary tree).
function repo() {
  const bare = mkdtempSync(join(tmpdir(), 'chalk-cf-bare-'));
  execSync('git init -q --bare -b main', { cwd: bare });
  const d = mkdtempSync(join(tmpdir(), 'chalk-cf-'));
  execSync('git init -q -b main', { cwd: d }); execSync('git config user.email t@t.t && git config user.name t', { cwd: d });
  execSync(`git remote add origin ${bare}`, { cwd: d });
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'README.md'), '# x\n'); execSync('git add -A && git commit -qm init && git push -q -u origin main', { cwd: d });
  conf(d, (o) => { o.worktree = { ...(o.worktree || {}), enabled: false }; });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a feature', state: 'in-progress', branch: 'feat/1-a', branchType: 'feat',
    acceptanceCriteria: [{ text: 'x' }], reviews: [], pipeline: { stage: 'branched', at: '2026-01-01T00:00:00Z' },
  }]));
  execSync('git checkout -q -b feat/1-a', { cwd: d });
  return d;
}
const headFiles = (d) => execSync('git show --stat --name-only --pretty=format: HEAD', { cwd: d, encoding: 'utf8' }).trim().split('\n').filter(Boolean);

test('first commit lands the code; a FOLLOW-UP commit lands a later review-fix change into git', () => {
  const d = repo();
  // Round 1: the executor's change.
  writeFileSync(join(d, 'feature.js'), 'export const V1 = 1;\n');
  assert.equal(chalk(d, 'commit', 'task-aaaaaaaa').code, 0);
  assert.ok(headFiles(d).includes('feature.js'), 'the first commit contains the code');
  assert.equal(tasksOf(d)[0].pipeline.stage, 'committed', 'stage advanced to committed');

  // Round 2: a review BLOCK is addressed — a NEW file changes AFTER the first commit.
  writeFileSync(join(d, 'review-fix.js'), 'export const FIX = 1;\n');
  const r = chalk(d, 'commit', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `commit must not no-op when there are new changes: ${r.out}`);
  assert.match(r.out, /follow-up/i, 'the follow-up commit is labeled, not a silent no-op');
  // The fix is now COMMITTED — what the reviewer sees (working tree) equals what merge takes (git).
  assert.ok(headFiles(d).includes('review-fix.js'), 'the review-fix change is committed, not left in the working tree');
  // No uncommitted CODE lingers (spine state under .chalk/ legitimately lands out-of-band, so ignore it).
  const dirtyCode = execSync('git status --porcelain', { cwd: d, encoding: 'utf8' }).trim().split('\n').filter(Boolean).filter((l) => !l.includes('.chalk/'));
  assert.deepEqual(dirtyCode, [], `no uncommitted code should linger: ${dirtyCode.join(', ')}`);
  // The committed branch diff vs base contains BOTH rounds — nothing was dropped at merge time.
  const branchDiff = execSync('git diff main...HEAD --name-only', { cwd: d, encoding: 'utf8' });
  assert.match(branchDiff, /feature\.js/); assert.match(branchDiff, /review-fix\.js/);
});

test('a clean re-run past the committed stage is an idempotent no-op (nothing new)', () => {
  const d = repo();
  writeFileSync(join(d, 'feature.js'), 'export const V1 = 1;\n');
  chalk(d, 'commit', 'task-aaaaaaaa');
  const headBefore = execSync('git rev-parse HEAD', { cwd: d, encoding: 'utf8' }).trim();
  const r = chalk(d, 'commit', 'task-aaaaaaaa'); // no new changes
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /already done|nothing new/i, 'a truly-clean re-run reports the idempotent no-op');
  assert.equal(execSync('git rev-parse HEAD', { cwd: d, encoding: 'utf8' }).trim(), headBefore, 'no empty commit was created');
});

test('the first commit still errors when the executor produced no changes at all', () => {
  const d = repo(); // stage is 'branched', nothing written
  const r = chalk(d, 'commit', 'task-aaaaaaaa');
  assert.notEqual(r.code, 0, 'an empty first commit is still a loud failure, not a silent pass');
  assert.match(r.out, /nothing to commit/i);
});
