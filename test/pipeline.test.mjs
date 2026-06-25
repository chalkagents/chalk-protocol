// Tests for the GitHub issue→merge pipeline. Hermetic: a real temp git repo + a STUB `gh`
// (a node script that records its args and returns canned output) — no network, no real merges.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentRepo, branchExists, worktreeAdd, worktreeExists, worktreeRemove, gh } from '../lib/git.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-pipe-'));

// Make a throwaway git repo with one commit on `main` and a fake origin remote.
function repo(remote = 'git@github.com-devid:chalkagents/chalk-protocol.git') {
  const d = scratch();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main');
  g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# tmp\n');
  g('add README.md'); g('commit -m init');
  g(`remote add origin ${remote}`);
  return d;
}

// Write a stub `gh` as an executable node script; returns the command string to pass as ghCommand.
function stubGh(dir, body) {
  const p = join(dir, 'fake-gh.mjs');
  writeFileSync(p, body);
  return `node ${p}`;
}
// Mutate .chalk/chalk.json protocol config in a scratch dir.
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

test('git foundation — currentRepo parses owner/repo from the ssh-alias remote', () => {
  const d = repo();
  assert.equal(currentRepo(d), 'chalkagents/chalk-protocol');
  assert.equal(currentRepo(repo('https://github.com/foo/bar.git')), 'foo/bar');
});

test('git foundation — worktree add/exists/remove is idempotent; branchExists works', () => {
  const d = repo();
  const wt = join(d, '..', 'tmp-wt-' + Math.floor(process.hrtime()[1]));
  assert.equal(branchExists(d, 'feat/x'), false);
  worktreeAdd(d, { dir: wt, branch: 'feat/x', base: 'main' });
  assert.ok(worktreeExists(d, wt), 'worktree registered');
  assert.ok(existsSync(join(wt, 'README.md')), 'worktree checked out the branch');
  assert.equal(branchExists(d, 'feat/x'), true, 'branch created');
  worktreeAdd(d, { dir: wt, branch: 'feat/x', base: 'main' }); // idempotent — no throw
  worktreeRemove(d, { dir: wt, branch: 'feat/x' });
  assert.equal(worktreeExists(d, wt), false, 'worktree removed');
  assert.equal(branchExists(d, 'feat/x'), false, 'branch deleted');
});

test('git foundation — gh() runs the BYO command and returns its stdout', () => {
  const d = repo();
  const ghCmd = stubGh(d, `console.log(JSON.stringify({ args: process.argv.slice(2) }));`);
  const out = JSON.parse(gh(d, ghCmd, 'issue list --json number'));
  assert.deepEqual(out.args, ['issue', 'list', '--json', 'number']);
});

test('init writes the github/worktree/e2e pipeline config defaults', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const proto = JSON.parse(readFileSync(join(d, '.chalk/chalk.json'), 'utf8')).protocol;
  assert.equal(proto.github.command, 'gh');
  assert.equal(proto.github.mergeMethod, 'squash');
  assert.equal(proto.worktree.enabled, true);
  assert.ok('e2e' in proto, 'e2e config present');
});

test('issue pull — one task per open issue, criteria from checklist, idempotent', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([
    { number: 1, title: 'Add login', url: 'https://x/1', body: '- [ ] render form\\n- [ ] validate input', labels: [{ name: 'enhancement' }] },
    { number: 2, title: 'Fix crash', url: 'https://x/2', body: 'no checklist here', labels: [{ name: 'bug' }] }
  ]));`);
  conf(d, (o) => { o.github.command = ghCmd; });

  let r = chalk(d, 'issue', 'pull');
  assert.equal(r.code, 0);
  assert.match(r.out, /pulled .*2.* new issue/);
  const tasks = tasksOf(d);
  assert.equal(tasks.length, 2);
  const t1 = tasks.find((t) => t.issue.number === 1);
  assert.equal(t1.branchType, 'feat', 'enhancement → feat');
  assert.equal(t1.state, 'specd', 'checklist body → criteria → specd');
  assert.equal(t1.acceptanceCriteria.length, 2);
  const t2 = tasks.find((t) => t.issue.number === 2);
  assert.equal(t2.branchType, 'fix', 'bug → fix');
  assert.equal(t2.state, 'todo', 'no checklist → no criteria → todo');

  // Idempotent: a second pull creates nothing new.
  r = chalk(d, 'issue', 'pull');
  assert.match(r.out, /pulled .*0.* new issue/);
  assert.equal(tasksOf(d).length, 2);
});
