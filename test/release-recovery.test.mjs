// `chalk release --commit` partial-failure recovery (#91) — the collision is probed up front, but
// `git tag` can still fail AFTER the release commit (hook, perms, a ref lock). That die() left an
// untagged chore(release) commit with the bumped package.json, and a re-run bumped FROM the bumped
// version: a version skip plus a second release commit. Contract: a re-run detects the ORPHAN — the
// newest release commit whose version has neither a tag NOR a `Released vX` decision (the decision
// is the completion marker; an intentional --no-tag release records it, so its untagged commit is
// NOT an orphan) — and RESUMES it: tag that commit wherever it sits, mark released only the tasks
// done before it existed, write nothing new. Converges on ONE commit + ONE tag; no rollback (a hard
// reset could eat unrelated staged work). Locked contract for task-f1308f82.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const releaseCommits = (d) => git(d, 'log --format=%s').split('\n').filter((s) => /^chore\(release\):/.test(s));

// A git repo with one done, unreleased FEATURE task and package.json 0.0.0 → the release computes v0.1.0.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-relrec-'));
  git(d, 'init -q'); git(d, 'config user.email t@t'); git(d, 'config user.name t');
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'done', doneAt: '2026-01-01T00:00:00Z', branchType: 'feat' },
  ]));
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  git(d, 'add -A'); git(d, 'commit -qm init');
  return d;
}

test('release --commit — a tag failure AFTER the commit, then a re-run, converges on ONE release commit + tag', () => {
  const d = repo();
  // Block refs/tags/v0.1.0 with a conflicting ref UNDER it — the up-front collision probe does not
  // see it (v0.1.0 itself does not resolve), so the commit lands and only the tag creation fails.
  git(d, 'tag v0.1.0/block');
  const r1 = chalk(d, 'release', '--commit');
  assert.notEqual(r1.code, 0, 'the interrupted run fails loudly');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'the orphaned release commit exists');
  assert.ok(!taskOf(d).released, 'nothing was marked released by the interrupted run');
  assert.equal(git(d, "tag --list 'v0.1.0'"), '', 'and no tag was created');

  git(d, 'tag -d v0.1.0/block'); // the operator clears the obstruction…
  const r2 = chalk(d, 'release', '--commit'); // …and simply re-runs
  assert.equal(r2.code, 0, `the re-run resumes instead of dying: ${r2.out}`);
  assert.match(r2.out, /resumed/i, 'the resume is named, not silent');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'STILL exactly one release commit — no re-bump, no stacking');
  assert.equal(git(d, 'rev-parse v0.1.0^{commit}'), git(d, 'rev-parse HEAD'), 'the tag landed on the orphaned commit');
  assert.equal(taskOf(d).released, '0.1.0', 'the work is marked released at the ORIGINAL version — no skip');
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '0.1.0', 'package.json holds the one bump');
});

test('release --commit — a successful release does NOT trip the resume on the next cycle', () => {
  const d = repo();
  assert.equal(chalk(d, 'release', '--commit').code, 0, 'first release succeeds');
  // A new done task arrives; HEAD is still the v0.1.0 release commit — but its tag EXISTS, so the
  // next release must bump normally, not "resume" onto the old version.
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks.push({ id: 'task-bbbbbbbb', title: 'feat: another', state: 'done', doneAt: '2026-01-02T00:00:00Z', branchType: 'feat' });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the next cycle releases normally: ${r.out}`);
  assert.doesNotMatch(r.out, /resumed/i, 'no false resume');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.2.0', 'chore(release): v0.1.0'], 'a real second release with a real bump');
  assert.equal(git(d, 'rev-parse v0.2.0^{commit}'), git(d, 'rev-parse HEAD'), 'tagged at the new commit');
});

test('release --commit --no-tag — commits the bump, skips the tag, still marks released', () => {
  const d = repo();
  const r = chalk(d, 'release', '--commit', '--no-tag');
  assert.equal(r.code, 0, `--commit --no-tag succeeds: ${r.out}`);
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'the release commit exists');
  assert.equal(git(d, "tag --list 'v*'"), '', 'no tag was created');
  assert.equal(taskOf(d).released, '0.1.0', 'the work is marked released');
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '0.1.0', 'the bump landed');
});

test('an INTENTIONAL --no-tag release is not an orphan — the next cycle bumps normally, never "resumes"', () => {
  // This is the dev/main promote flow: `release --commit --no-tag` on dev leaves a legitimately
  // untagged release commit. New work arriving afterwards must get a REAL bump — not be swallowed
  // into the old version with no changelog entry (the false-resume failure mode).
  const d = repo();
  assert.equal(chalk(d, 'release', '--commit', '--no-tag').code, 0, 'the intentional --no-tag release succeeds');
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks.push({ id: 'task-bbbbbbbb', title: 'feat: another', state: 'done', doneAt: '2026-01-02T00:00:00Z', branchType: 'feat' });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the next cycle releases normally: ${r.out}`);
  assert.doesNotMatch(r.out, /resumed/i, 'no false resume onto the completed --no-tag release');
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.2.0', 'chore(release): v0.1.0'], 'a real second release with a real bump');
  const t2 = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')).find((t) => t.id === 'task-bbbbbbbb');
  assert.equal(t2.released, '0.2.0', 'the new work ships at the NEW version');
  assert.match(readFileSync(join(d, 'CHANGELOG.md'), 'utf8'), /## v0\.2\.0[\s\S]*another/, 'and appears in the v0.2.0 notes');
});

test('recovery — the orphan is found even when later commits landed on top of it', () => {
  const d = repo();
  git(d, 'tag v0.1.0/block');
  assert.notEqual(chalk(d, 'release', '--commit').code, 0, 'interrupted after the commit');
  writeFileSync(join(d, 'unrelated.txt'), 'work continued\n');
  git(d, 'add unrelated.txt'); git(d, 'commit -qm "feat: unrelated work on top"'); // HEAD is no longer the orphan
  git(d, 'tag -d v0.1.0/block');
  // A post-interruption dry-run previews the RESUME — not a double-bumped next version — and writes nothing.
  const dry = chalk(d, 'release', '--commit', '--dry-run');
  assert.equal(dry.code, 0);
  assert.match(dry.out, /would RESUME/i, 'dry-run names the resume');
  assert.doesNotMatch(dry.out, /v0\.2\.0/, 'no double-bumped preview');
  assert.equal(git(d, "tag --list 'v0.1.0'"), '', 'dry-run created no tag');
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the re-run still resumes: ${r.out}`);
  assert.match(r.out, /resumed/i);
  assert.deepEqual(releaseCommits(d), ['chore(release): v0.1.0'], 'still exactly one release commit');
  assert.notEqual(git(d, 'rev-parse v0.1.0^{commit}'), git(d, 'rev-parse HEAD'), 'the tag is NOT on HEAD…');
  assert.equal(git(d, 'log -1 --format=%s v0.1.0'), 'chore(release): v0.1.0', '…it is on the buried orphan commit');
  assert.equal(taskOf(d).released, '0.1.0');
});

test('recovery — tasks done AFTER the interrupted commit are left for the next cycle, not swallowed', () => {
  const d = repo();
  git(d, 'tag v0.1.0/block');
  assert.notEqual(chalk(d, 'release', '--commit').code, 0, 'interrupted after the commit');
  // A new task finishes AFTER the orphan commit was created — it is not in v0.1.0's frozen notes.
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks.push({ id: 'task-bbbbbbbb', title: 'feat: late arrival', state: 'done', doneAt: '2030-01-01T00:00:00Z', branchType: 'feat' });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  git(d, 'tag -d v0.1.0/block');
  const r = chalk(d, 'release', '--commit');
  assert.equal(r.code, 0, `the resume succeeds: ${r.out}`);
  assert.match(r.out, /left for the next release/i, 'the deferral is reported');
  const byId = Object.fromEntries(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')).map((t) => [t.id, t]));
  assert.equal(byId['task-aaaaaaaa'].released, '0.1.0', 'the interrupted release set ships at its version');
  assert.ok(!byId['task-bbbbbbbb'].released, 'the late arrival is NOT swallowed into v0.1.0');
  const r2 = chalk(d, 'release', '--commit');
  assert.equal(r2.code, 0, 'the next cycle picks it up');
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')).find((t) => t.id === 'task-bbbbbbbb').released, '0.2.0', 'at the next version');
});
