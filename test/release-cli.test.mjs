// `chalk release` — turns the merged, done work into a shipped release: CHANGELOG entry, version
// bump, git tag, and a `released` marker so it's idempotent. Covers the happy path (version from
// package.json, CHANGELOG prepend, pkg bump, tag, mark), idempotency, the non-git tolerance, and the
// nothing-to-ship early exit.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const readTasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json')));
const writeTasks = (d, ts) => writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(ts, null, 2));

// A project with two merged (done) tasks: a feat and a fix.
function project({ git = true, pkg = true } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'release-'));
  if (git) { execSync('git init -b main', { cwd: d, stdio: 'pipe' }); execSync('git config user.email t@t.t && git config user.name t', { cwd: d, stdio: 'pipe' }); }
  chalk(d, 'init', '--name', 'd');
  if (pkg) writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'app', version: '1.2.3' }, null, 2));
  if (git) execSync('git add -A && git commit -q -m init', { cwd: d, stdio: 'pipe' }); // a HEAD to tag from
  const ts = readTasks(d);
  ts.push(
    { id: 'task-aaa', title: 'feat: add sort', state: 'done', doneAt: '2026-06-01', branchType: 'feat', pr: { number: 11 }, acceptanceCriteria: [], tests: [] },
    { id: 'task-bbb', title: 'fix: off-by-one', state: 'done', doneAt: '2026-06-02', branchType: 'fix', pr: { number: 12 }, acceptanceCriteria: [], tests: [] },
  );
  writeTasks(d, ts);
  return d;
}

test('chalk release — bumps from package.json, writes CHANGELOG, bumps pkg, tags, marks released', () => {
  const d = project();
  const r = chalk(d, 'release');
  assert.equal(r.status, 0);
  // feat present → minor bump 1.2.3 → 1.3.0
  assert.match(`${r.stdout}${r.stderr}`, /v1\.3\.0/);

  const cl = readFileSync(join(d, 'CHANGELOG.md'), 'utf8');
  assert.match(cl, /^# Changelog/m, 'CHANGELOG has a title');
  assert.match(cl, /## v1\.3\.0/);
  assert.match(cl, /### Features\n- add sort \(#11\)/);
  assert.match(cl, /### Fixes\n- off-by-one \(#12\)/);

  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '1.3.0', 'package.json bumped');
  assert.equal(execSync('git tag', { cwd: d, encoding: 'utf8' }).trim(), 'v1.3.0', 'annotated tag created');
  assert.ok(readTasks(d).every((t) => t.released === '1.3.0'), 'tasks marked released');
  // the release must be RECORDED in the decision log with a real title (not undefined).
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /## Released v1\.3\.0/, 'decision logged with a proper title');
});

test('chalk release — idempotent: a second run finds nothing new', () => {
  const d = project();
  assert.equal(chalk(d, 'release').status, 0);
  const second = chalk(d, 'release');
  assert.equal(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /nothing to ship/i);
});

test('chalk release — --version and --no-tag honored; explicit version wins, no tag created', () => {
  const d = project();
  const r = chalk(d, 'release', '--version', '2.0.0', '--no-tag');
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '2.0.0');
  assert.equal(execSync('git tag', { cwd: d, encoding: 'utf8' }).trim(), '', 'no tag with --no-tag');
});

test('chalk release — non-Node project advances the version across releases via git tags', () => {
  const d = project({ pkg: false }); // no package.json → version must come from tags
  assert.equal(chalk(d, 'release').status, 0);
  // first release: feat → 0.1.0 off a 0.0.0 base, tagged v0.1.0
  assert.equal(execSync('git tag', { cwd: d, encoding: 'utf8' }).trim(), 'v0.1.0');
  // a NEW done task, then a second release: must read current from the tag (0.1.0), not recompute 0.0.x
  const ts = readTasks(d); ts.push({ id: 'task-ccc', title: 'fix: later bug', state: 'done', doneAt: '2026-06-03', branchType: 'fix', pr: { number: 13 }, acceptanceCriteria: [], tests: [] }); writeTasks(d, ts);
  assert.equal(chalk(d, 'release').status, 0);
  assert.match(execSync('git tag', { cwd: d, encoding: 'utf8' }), /v0\.1\.1/, 'version advanced from the tag (0.1.0 → 0.1.1)');
  const cl = readFileSync(join(d, 'CHANGELOG.md'), 'utf8');
  assert.ok((cl.match(/## v/g) || []).length === 2, 'two distinct version sections, no duplicate');
});

test('chalk release — tolerates a non-git project (no tag, still writes CHANGELOG)', () => {
  const d = project({ git: false });
  const r = chalk(d, 'release');
  assert.equal(r.status, 0, 'does not crash without git');
  assert.ok(existsSync(join(d, 'CHANGELOG.md')));
});

test('chalk release — no releasable tasks → clean early exit, no CHANGELOG, no bump', () => {
  const d = project({ pkg: true });
  writeTasks(d, readTasks(d).filter((t) => t.state !== 'done')); // drop the done tasks
  const r = chalk(d, 'release');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /nothing to ship/i);
  assert.equal(existsSync(join(d, 'CHANGELOG.md')), false, 'no CHANGELOG written');
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '1.2.3', 'version untouched');
});
