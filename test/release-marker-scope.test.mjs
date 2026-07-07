// Release orphan-recovery marker is namespaced + depth-independent (#125). The #91 recovery detects
// an orphaned `chore(release): vX` commit and treats it as finished when a completion marker matches.
// That marker was matched as a BARE substring "Released vX" over all of decisions.md, within a fixed
// `log -50` window — two failure modes flagged across #91/#98/#100 reviews: (1) any decision whose
// PROSE mentions "Released vX" suppressed a legitimate resume → the re-run bumped from the already-
// bumped version and stacked a second release commit; (2) an orphan buried beyond 50 commits silently
// reverted to bump-from-bumped. Now the marker is anchored to the `## Released vX` decision HEADING
// (not shared prose), and the orphan is found via git's own --grep at any depth. This suite pins both.
// Locked contract for the task tracking issue #125.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const releaseCommits = (d) => git(d, 'log --format=%s').split('\n').filter((s) => /^chore\(release\):/.test(s));

// A git repo with one done, unreleased feature task and package.json 0.0.0 → the release computes v0.1.0.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-relmark-'));
  git(d, 'init -q'); git(d, 'config user.email t@t'); git(d, 'config user.name t');
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'done', doneAt: '2026-01-01T00:00:00Z', branchType: 'feat' },
  ]));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  git(d, 'add -A'); git(d, 'commit -qm init');
  return d;
}
// Interrupt a release AFTER the commit but BEFORE the tag (a blocked ref under v0.1.0).
function orphan(d) {
  git(d, 'tag v0.1.0/block');
  assert.notEqual(chalk(d, 'release', '--commit').code, 0, 'the interrupted run fails, leaving an orphan');
  git(d, 'tag -d v0.1.0/block');
}

test('a decision whose PROSE mentions "Released v0.1.0" does NOT suppress a genuine resume', () => {
  const d = repo();
  orphan(d);
  // A manual decision whose BODY contains the version text — the exact spoof that used to match.
  chalk(d, 'decision', 'Release timing discussion', '--why', 'we agreed Released v0.1.0 would ship Friday');
  const before = readFileSync(join(d, '.chalk/decisions.md'), 'utf8');
  assert.match(before, /Released v0\.1\.0/, 'the prose mention is present (the bug trigger)…');
  assert.doesNotMatch(before, /^## Released v0\.1\.0$/m, '…but NOT as a completion heading');

  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the resume must not be suppressed by prose: ${r.out}`);
  assert.match(r.out, /resumed/i, 'it resumes the orphan, not double-bumps');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'exactly one release commit — no re-bump, no stacking');
  assert.equal(taskOf(d).released, '0.1.0', 'shipped at the original version, no skip');
  assert.equal(git(d, 'rev-parse v0.1.0^{commit}'), git(d, 'rev-parse HEAD'), 'the tag landed on the orphan');
});

test('a real completion HEADING still suppresses the resume (no false resume onto a finished release)', () => {
  const d = repo();
  assert.equal(chalk(d, 'release', '--commit').code, 0, 'a normal release writes the ## Released heading');
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /^## Released v0\.1\.0$/m, 'the heading marker exists');
  // A new done task; HEAD is still the release commit but it is COMPLETE (heading + tag) → bump normally.
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks.push({ id: 'task-bbbbbbbb', title: 'feat: another', state: 'done', doneAt: '2026-01-02T00:00:00Z', branchType: 'feat' });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /resumed/i, 'the finished release is not re-resumed');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.2.0', 'chore(release): v0.1.0'], 'a real second release');
});

test('an orphan buried beyond a 50-commit window is still found (depth-independent detection)', () => {
  const d = repo();
  orphan(d); // v0.1.0 orphan at HEAD
  // Pile 55 unrelated commits on top — deeper than the old fixed `log -50` scan.
  for (let i = 0; i < 55; i++) { writeFileSync(join(d, `f${i}.txt`), String(i)); git(d, `add f${i}.txt`); git(d, `commit -qm "chore: filler ${i}"`); }
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the deep orphan is found and resumed: ${r.out}`);
  assert.match(r.out, /resumed/i, 'resumed rather than double-bumping from the bumped version');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'still exactly one release commit');
  assert.equal(git(d, 'log -1 --format=%s v0.1.0'), 'chore(release): v0.1.0', 'the tag is on the buried orphan');
  assert.equal(taskOf(d).released, '0.1.0');
});
