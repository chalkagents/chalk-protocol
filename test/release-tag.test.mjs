// C1-remainder / silent-failure hardening — `chalk release` used to swallow a failed `git tag` yet still
// mark every task `released`, shipping work onto a version with NO tag (and the next release, seeing them
// marked, would never re-tag). Now the tag is attempted FIRST and, in a git repo, a tag failure is fatal
// BEFORE anything is written or marked. A non-git project legitimately can't tag — that stays a
// CHANGELOG/pkg-only release, not an error. Locked contract.
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
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' });

// A git repo with one done, unreleased FEATURE task and package.json 0.0.0 → the release computes v0.1.0.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-reltag-'));
  git(d, 'init -q'); git(d, 'config user.email t@t'); git(d, 'config user.name t');
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'done', doneAt: '2026-01-01T00:00:00Z', branchType: 'feat' },
  ]));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  git(d, 'add -A'); git(d, 'commit -qm init');
  return d;
}

test('release — a colliding git tag fails loudly and does NOT mark work shipped (no phantom version)', () => {
  const d = repo();
  git(d, 'tag v0.1.0'); // the version the release will compute already exists → `git tag` will fail
  const r = chalk(d, 'release');
  assert.notEqual(r.code, 0, 'release fails on the tag collision instead of swallowing it');
  assert.match(r.out, /tag/i, 'the failure names the tag problem');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.ok(!t.released, 'the task is NOT marked released — nothing shipped onto an untagged version');
  assert.ok(!existsSync(join(d, 'CHANGELOG.md')), 'tag-first: it failed before writing the CHANGELOG');
});

test('release — the happy path still tags and marks work released', () => {
  const d = repo(); // no colliding tag
  const r = chalk(d, 'release');
  assert.equal(r.code, 0, 'a clean release succeeds');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal(t.released, '0.1.0', 'the task is marked released at the bumped version');
  assert.equal(git(d, 'tag --list v0.1.0').trim(), 'v0.1.0', 'the tag was created');
  assert.ok(existsSync(join(d, 'CHANGELOG.md')), 'and the CHANGELOG was written');
});
