// `chalk release --commit` — commit the CHANGELOG + version bump, then tag THAT commit, so the
// tagged tree carries the bumped version (release.yml publishes it as-is; the old workflow step that
// normalized the version from the tag name is gone). The tag-first collision safety is preserved:
// with --commit the collision is probed up front, and a pre-existing tag fails BEFORE anything is
// written, committed, or marked released. Locked contract for task-021f498.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

// A git repo with one done, unreleased FEATURE task and package.json 0.0.0 → the release computes v0.1.0.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-relcommit-'));
  git(d, 'init -q'); git(d, 'config user.email t@t'); git(d, 'config user.name t');
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'done', doneAt: '2026-01-01T00:00:00Z', branchType: 'feat' },
  ]));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  git(d, 'add -A'); git(d, 'commit -qm init');
  return d;
}

test('release --commit — commits CHANGELOG + bump, then tags THAT commit (the tagged tree carries the bumped version)', () => {
  const d = repo();
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `a clean --commit release succeeds: ${r.out}`);
  // The release commit exists, is conventional, and the tag points at it.
  assert.equal(git(d, 'log -1 --format=%s'), 'chore(release): v0.1.0', 'conventional release commit at HEAD');
  assert.equal(git(d, 'rev-parse v0.1.0^{commit}'), git(d, 'rev-parse HEAD'), 'the tag points at the release commit');
  // The tagged TREE carries the bumped version — the release.yml normalization step is obsolete.
  const taggedPkg = JSON.parse(git(d, 'show v0.1.0:package.json'));
  assert.equal(taggedPkg.version, '0.1.0', 'git show vX.Y.Z:package.json reports the bumped version');
  // The commit contains exactly the release artifacts.
  const files = git(d, 'show --name-only --format= HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(files, ['CHANGELOG.md', 'package.json'], 'the release commit holds exactly CHANGELOG.md + package.json');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal(t.released, '0.1.0', 'the task is marked released at the bumped version');
});

test('release --commit — a pre-existing tag dies BEFORE writing, committing, or marking anything released', () => {
  const d = repo();
  git(d, 'tag v0.1.0'); // the version the release will compute already exists
  const head = git(d, 'rev-parse HEAD');
  const r = chalk(d, 'release', '--commit');
  assert.notEqual(r.code, 0, 'the collision fails loudly instead of being swallowed');
  assert.match(r.out, /tag v0\.1\.0/i, 'the failure names the colliding tag');
  assert.ok(!existsSync(join(d, 'CHANGELOG.md')), 'no CHANGELOG was written');
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '0.0.0', 'package.json was not bumped');
  assert.equal(git(d, 'rev-parse HEAD'), head, 'no release commit was created');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.ok(!t.released, 'the task is NOT marked released');
});

test('release --commit — unrelated staged work is NOT swept into the release commit', () => {
  const d = repo();
  writeFileSync(join(d, 'wip.txt'), 'half-finished\n');
  git(d, 'add wip.txt'); // staged, but it must not ride along
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the release succeeds alongside staged work: ${r.out}`);
  const files = git(d, 'show --name-only --format= HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(files, ['CHANGELOG.md', 'package.json'], 'the release commit still holds only the release artifacts');
  assert.match(git(d, 'status --porcelain'), /^A\s+wip\.txt/m, 'the unrelated file stays staged, uncommitted');
});

test('release without --commit — the tag-first behavior is unchanged (no release commit is created)', () => {
  const d = repo();
  const head = git(d, 'rev-parse HEAD');
  const r = chalk(d, 'release');
  assert.equal(r.code, 0, `a plain release still succeeds: ${r.out}`);
  assert.equal(git(d, 'rev-parse HEAD'), head, 'no commit was created — the tag sits on the pre-bump commit');
  assert.equal(git(d, 'tag --list v0.1.0'), 'v0.1.0', 'the tag was still created');
});

test('chalk help — documents the --commit flag on the release line', () => {
  const r = chalk(tmpdir(), 'help');
  assert.match(r.out, /chalk release .*--commit/, 'the release usage line advertises --commit');
});
