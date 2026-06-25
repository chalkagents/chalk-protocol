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

test('branch + cleanup — creates a <type>/<issue>-<slug> worktree, then tears it down', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add dark mode', url: 'u', body: '', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch(); // isolate worktrees here so parallel runs never collide
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);

  assert.equal(chalk(d, 'branch', id).code, 0);
  let t = tasksOf(d)[0];
  assert.equal(t.branch, 'feat/7-add-dark-mode', 'branch is <type>/<issue>-<slug>');
  assert.ok(t.worktree && existsSync(t.worktree), 'worktree dir exists');
  assert.ok(existsSync(join(t.worktree, 'README.md')), 'worktree checked out the branch');
  assert.equal(t.pipeline.stage, 'branched');
  assert.ok(branchExists(d, 'feat/7-add-dark-mode'));

  assert.equal(chalk(d, 'cleanup', id).code, 0);
  t = tasksOf(d)[0];
  assert.ok(!t.worktree, 'worktree cleared on task');
  assert.equal(t.pipeline.stage, 'cleaned');
  assert.equal(branchExists(d, 'feat/7-add-dark-mode'), false, 'local branch deleted');
});

test('work+verify run in the worktree — executor edits + gates resolve there, not in primary', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 3, title: 'feature', url: 'u', body: '- [ ] do it', labels: [] }]));`);
  const wtbase = scratch();
  // executor writes impl.txt in its cwd; verify (check.mjs) passes iff impl.txt exists in cwd.
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync, readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('impl.txt','ok');`);
  writeFileSync(join(d, 'check.mjs'), `import {existsSync} from 'node:fs'; process.exit(existsSync('impl.txt')?0:1);`);
  conf(d, (o) => {
    o.github.command = ghCmd; o.worktree.dir = wtbase;
    o.verify.test = `node ${join(d, 'check.mjs')}`;
    o.executor = { command: `node ${join(d, 'exec.mjs')}` };
  });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const wt = tasksOf(d)[0].worktree;

  assert.equal(chalk(d, 'run', '--max', '1').code, 0);
  assert.equal(tasksOf(d)[0].state, 'done', 'task driven to done');
  assert.ok(existsSync(join(wt, 'impl.txt')), 'executor wrote into the WORKTREE');
  assert.ok(!existsSync(join(d, 'impl.txt')), 'primary tree untouched — gates ran in the worktree');
});

test('e2e gate — a locked .test.yaml is run via the BYO runner and folds into verify', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  writeFileSync(join(d, '.chalk/tests/login.test.yaml'), 'apiVersion: chalk/v1\nkind: Test\nid: spec-login\nname: Login\nsteps: []\n');
  // stub runner: parse --out, write run.json, exit per an env-controlled verdict file.
  writeFileSync(join(d, 'runspec.mjs'), `import {writeFileSync,readFileSync,existsSync} from 'node:fs';
    const a=process.argv; const out=a[a.indexOf('--out')+1];
    const pass=!existsSync('FAIL');
    writeFileSync(out+'/run.json', JSON.stringify({runId:'r1',specId:'spec-login',status:pass?'passed':'failed',startedAt:1,steps:[]}));
    process.exit(pass?0:1);`);
  conf(d, (o) => { o.e2e = { command: `node ${join(d, 'runspec.mjs')}`, baseUrl: '', runsDir: '.chalk/runs' }; });
  chalk(d, 'task', 'add', 'login works');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'logs in', '--test', '.chalk/tests/login.test.yaml');
  chalk(d, 'start', id);

  let v = chalk(d, 'verify');
  assert.equal(v.code, 0, 'verify GREEN when the spec passes');
  assert.match(v.out, /login\.test\.yaml/);
  assert.ok(existsSync(join(d, '.chalk/runs/spec-login')), 'run evidence written under .chalk/runs/<specId>/');
  // Force the spec to fail → verify RED.
  writeFileSync(join(d, 'FAIL'), '');
  v = chalk(d, 'verify');
  assert.equal(v.code, 2, 'verify RED when the spec fails');
});
