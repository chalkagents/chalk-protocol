// Issue intake commits its spine writes to base, so imports don't leak into task branches (#114).
// Four reviews flagged the same design-intent finding: a task's diff bundled unrelated queue metadata
// (tasks.json entries + board rows written during `chalk issue pull`), violating "keep diffs small and
// scoped." Intake left that state floating in the working tree, where it bundled into whichever task
// branch committed next. Now `chalk issue pull` commits its spine writes in a dedicated, SCOPED
// chore(spine) commit before any task branch is cut. This suite pins: intake leaves a clean working
// tree with a chore(spine) commit carrying the imports, the commit is scoped to spine files (no code),
// and a later task-branch commit contains no tasks.json / other-task entries. Locked contract for #114.
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
const git = (d, a) => execSync(`git ${a}`, { cwd: d, encoding: 'utf8' });
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

// A git repo with chalk initialized + committed, and a stub gh that lists TWO open issues.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-intake-'));
  git(d, 'init -q -b main'); execSync('git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  const gh = join(d, 'gh.mjs');
  writeFileSync(gh, `const a=process.argv.slice(2);
    if(a.includes('issue')&&a.includes('list')) console.log(JSON.stringify([
      {number:11,title:'FIRST_TASK',body:'- [ ] do a',labels:[],url:'u1'},
      {number:22,title:'SECOND_TASK',body:'- [ ] do b',labels:[],url:'u2'}]));
    else console.log('[]');`);
  conf(d, (o) => { o.github = { ...o.github, command: `node ${gh}` }; o.worktree = { ...(o.worktree || {}), enabled: false }; });
  git(d, 'add -A'); git(d, 'commit -q -m init');
  return d;
}

test('chalk issue pull — commits imports to base in a scoped chore(spine) commit; working tree stays clean', () => {
  const d = repo();
  const r = chalk(d, 'issue', 'pull');
  assert.equal(r.code, 0, r.out);
  assert.equal(tasksOf(d).length, 2, 'both issues imported');
  // The root-cause fix: intake is COMMITTED, not left floating in the working tree.
  assert.equal(git(d, 'status --porcelain').trim(), '', 'working tree is clean after intake — nothing floats into the next task branch');
  const head = git(d, 'log -1 --pretty=%s').trim();
  assert.match(head, /^chore\(spine\): import 2 issue\(s\)/, 'a dedicated chore(spine) commit records the import');
  // The intake commit is SCOPED to spine files — it carries tasks.json but no source code.
  const files = git(d, 'show --stat --name-only --pretty=format: HEAD').trim().split('\n').filter(Boolean);
  assert.ok(files.includes('.chalk/tasks.json'), 'the import commit contains tasks.json');
  assert.ok(files.every((f) => f.startsWith('.chalk/')), 'the import commit touches ONLY spine files, never code');
});

test('a task-branch commit after intake contains no tasks.json / other-task entries', () => {
  const d = repo();
  chalk(d, 'issue', 'pull'); // intake committed to main
  // Cut a feature branch for the first task and make a code change (manual mode: create the branch).
  const first = tasksOf(d).find((t) => t.title === 'FIRST_TASK');
  git(d, `checkout -q -b feat/11-first`);
  const t = tasksOf(d); t.find((x) => x.id === first.id).branch = 'feat/11-first';
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(t, null, 2));
  writeFileSync(join(d, 'feature.js'), 'export const REAL = 1;\n');
  assert.equal(chalk(d, 'commit', first.id.slice(0, 12)).code, 0);
  // The task commit carries the code, not spine churn or the other imported task.
  const diff = git(d, 'show HEAD');
  assert.match(diff, /feature\.js/, 'the code change is committed');
  assert.doesNotMatch(diff, /tasks\.json/, 'no tasks.json in the task-branch commit');
  assert.doesNotMatch(diff, /SECOND_TASK/, "no other imported task's metadata leaks into the branch");
});

test('scoping guarantee — a user\'s pre-staged unrelated work is NOT swept into the intake commit', () => {
  const d = repo();
  // The user has staged an unrelated code change but not committed it yet.
  writeFileSync(join(d, 'user-wip.js'), 'export const USER_WIP = 1;\n');
  git(d, 'add user-wip.js');
  chalk(d, 'issue', 'pull');
  // The chore(spine) commit must contain ONLY spine files — never the user's staged code.
  const files = git(d, 'show --stat --name-only --pretty=format: HEAD').trim().split('\n').filter(Boolean);
  assert.ok(files.every((f) => f.startsWith('.chalk/')), `intake commit swept in unrelated work: ${files.join(', ')}`);
  assert.ok(!files.includes('user-wip.js'), 'the user\'s pre-staged file is not in the intake commit');
  // And it stays staged (still the user's to commit) — proof `git commit -- <paths>` left the index alone.
  assert.match(git(d, 'status --porcelain user-wip.js'), /^A\s+user-wip\.js/m, 'the user\'s file is still staged, uncommitted');
});

test('non-git tree — intake still works, just without the commit (best-effort)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-intake-'));
  chalk(d, 'init', '--name', 'p'); // no git init
  const gh = join(d, 'gh.mjs');
  writeFileSync(gh, `const a=process.argv.slice(2); if(a.includes('list')) console.log(JSON.stringify([{number:11,title:'T',body:'- [ ] x',labels:[],url:'u'}])); else console.log('[]');`);
  conf(d, (o) => { o.github = { ...o.github, command: `node ${gh}` }; });
  const r = chalk(d, 'issue', 'pull');
  assert.equal(r.code, 0, `intake must not fail outside a git repo: ${r.out}`);
  assert.equal(tasksOf(d).length, 1, 'the task is still imported');
});
