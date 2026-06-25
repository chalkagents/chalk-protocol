// Tests for the GitHub issue→merge pipeline. Hermetic: a real temp git repo + a STUB `gh`
// (a node script that records its args and returns canned output) — no network, no real merges.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentRepo, branchExists, worktreeAdd, worktreeExists, worktreeRemove, gh, changedPaths } from '../lib/git.mjs';
import { dataUrlToPng, extractScreenshots, evidenceMarkdown } from '../lib/evidence.mjs';

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
// A working repo whose `origin` is a local bare repo, so `git push` actually works (offline).
function repoWithBare() {
  const bare = scratch();
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' });
  const d = scratch();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# tmp\n'); g('add README.md'); g('commit -m init');
  g(`remote add origin ${bare}`); g('push -u origin main');
  return d;
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

test('git foundation — changedPaths does not mangle the first modified path (trim regression)', () => {
  const d = repo();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  writeFileSync(join(d, 'bin-file.js'), 'x'); g('add bin-file.js'); g('commit -m add');
  writeFileSync(join(d, 'bin-file.js'), 'y');           // modify a tracked file (porcelain " M ...")
  writeFileSync(join(d, 'test-file.js'), 'z');          // untracked ("?? ...")
  const paths = changedPaths(d).sort();
  assert.deepEqual(paths, ['bin-file.js', 'test-file.js'], 'first path keeps its leading char');
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

test('commit + pr — conventional commit in the worktree, then push + gh pr create', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `const a=process.argv.slice(2);
    if(a.includes('pr')&&a.includes('create')) console.log('https://github.com/o/r/pull/42');
    else console.log(JSON.stringify([{number:5,title:'Add feature',url:'u',body:'- [ ] x',labels:[{name:'enhancement'}]}]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const wt = tasksOf(d)[0].worktree;
  writeFileSync(join(wt, 'feature.js'), 'export const f = () => 1;\n'); // simulate the executor's edit

  assert.equal(chalk(d, 'commit', id).code, 0);
  const msg = execSync('git log -1 --format=%B', { cwd: wt, encoding: 'utf8' });
  assert.match(msg, /^feat: add feature/, 'conventional subject from branchType + title');
  assert.match(msg, /Closes #5/, 'links the issue');
  assert.equal(tasksOf(d)[0].pipeline.stage, 'committed');

  const pr = chalk(d, 'pr', id);
  assert.equal(pr.code, 0);
  const t = tasksOf(d)[0];
  assert.equal(t.pr.number, 42, 'PR number parsed from gh output');
  assert.equal(t.pipeline.stage, 'pr-open');
  // The branch really landed on the (bare) remote.
  assert.match(execSync('git branch -a', { cwd: wt, encoding: 'utf8' }), /feat\/5-add-feature/);
});

test('commit — does not double a conventional prefix already in the issue title', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{number:8,title:'feat: add thing',url:'u',body:'',labels:[{name:'enhancement'}]}]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const wt = tasksOf(d)[0].worktree;
  writeFileSync(join(wt, 'x.js'), 'x\n');
  chalk(d, 'commit', id);
  const subject = execSync('git log -1 --format=%s', { cwd: wt, encoding: 'utf8' }).trim();
  assert.equal(subject, 'feat: add thing', 'single conventional prefix, not "feat: feat: …"');
});

test('pr — a malicious GitHub label name cannot inject shell commands', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const argsFile = join(d, 'gh-args.json');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2);
    if(a.includes('pr')&&a.includes('create')){ writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(a)); console.log('https://github.com/o/r/pull/1'); }
    else console.log(JSON.stringify([{number:1,title:'t',url:'u',body:'',labels:[{name:'x; touch PWNED'}]}]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const wt = tasksOf(d)[0].worktree;
  writeFileSync(join(wt, 'f.js'), 'export const f=1;\n');
  chalk(d, 'commit', id);
  chalk(d, 'pr', id);

  assert.ok(!existsSync(join(wt, 'PWNED')) && !existsSync(join(d, 'PWNED')), 'no command injection from the label');
  const args = JSON.parse(readFileSync(argsFile, 'utf8'));
  assert.ok(args.includes('x; touch PWNED'), 'label passed to gh as a single, intact argument');
});

test('evidence helpers — data-URL→PNG, step extraction, and blob-SHA markdown', () => {
  const d = scratch();
  const png = 'data:image/png;base64,' + Buffer.from('PNGBYTES').toString('base64');
  assert.equal(dataUrlToPng(png, join(d, 'a.png')), true);
  assert.equal(readFileSync(join(d, 'a.png'), 'utf8'), 'PNGBYTES');
  assert.equal(dataUrlToPng('not-a-data-url', join(d, 'b.png')), false);

  const run = { steps: [{ stepId: 's1', beforeScreenshot: png, afterScreenshot: png }, { stepId: 's2' }] };
  const paths = extractScreenshots(d, '.chalk/evidence/9', run);
  assert.deepEqual(paths, ['.chalk/evidence/9/before-s1.png', '.chalk/evidence/9/after-s1.png']);
  assert.ok(existsSync(join(d, '.chalk/evidence/9/before-s1.png')));

  const md = evidenceMarkdown('o/r', 'abc123', paths);
  assert.match(md, /## Test evidence/);
  assert.match(md, /blob\/abc123\/.chalk\/evidence\/9\/before-s1\.png/);
  assert.equal(evidenceMarkdown('o/r', 'abc', []), '', 'no images → empty section');
});

test('context — renders without crashing (regression: buildContext import)', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const r = chalk(d, 'context');
  assert.equal(r.code, 0);
  assert.match(r.out, /Chalk context/);
});

test('pipeline — unattended driver takes an issue all the way to a squash-merge + cleanup', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const merged = join(d, 'merged.txt');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2);
    if(a.includes('pr')&&a.includes('create')) console.log('https://github.com/o/r/pull/42');
    else if(a.includes('pr')&&a.includes('merge')) writeFileSync(${JSON.stringify(merged)}, a.join(' '));
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n');`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });

  chalk(d, 'issue', 'pull');
  const r = chalk(d, 'pipeline');
  assert.equal(r.code, 0, 'pipeline completes with no blocked tasks');

  const t = tasksOf(d)[0];
  assert.equal(t.state, 'done', 'task driven to done');
  assert.equal(t.pipeline.stage, 'cleaned');
  assert.ok(!t.worktree, 'worktree torn down');
  assert.ok(existsSync(merged), 'gh pr merge was called');
  assert.match(readFileSync(merged, 'utf8'), /pr merge 42 --squash --delete-branch/);
  assert.equal(branchExists(d, t.branch), false, 'local branch deleted');
});

test('board testArtifact — reads REAL run.json evidence + PR fields (one authoritative source)', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  writeFileSync(join(d, '.chalk/tests/x.test.yaml'), 'apiVersion: chalk/v1\nkind: Test\nid: spec-x\nname: X\nsteps: []\n');
  mkdirSync(join(d, '.chalk/runs/spec-x/run-1'), { recursive: true });
  writeFileSync(join(d, '.chalk/runs/spec-x/run-1/run.json'), JSON.stringify({ runId: 'run-1', specId: 'spec-x', status: 'passed', startedAt: 1000, finishedAt: 2000, steps: [] }));
  chalk(d, 'task', 'add', 'login');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'logs in', '--test', '.chalk/tests/x.test.yaml');
  // Simulate the pipeline's pr stage having set the PR on the task.
  const tj = tasksOf(d); tj[0].pr = { number: 99, url: 'https://github.com/o/r/pull/99' };
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tj, null, 2));

  chalk(d, 'sync');
  const art = JSON.parse(readFileSync(join(d, '.chalk/boards/chalk-protocol.board.json'), 'utf8')).cards[0].testArtifact;
  assert.equal(art.specId, 'spec-x');
  assert.equal(art.lastRun.runId, 'run-1', 'lastRun comes from the real run.json, not a synthesized done-/review- id');
  assert.equal(art.lastRun.status, 'passed');
  assert.equal(art.lastRun.at, 2000, 'uses finishedAt from run.json');
  assert.equal(art.prNumber, 99);
  assert.equal(art.prUrl, 'https://github.com/o/r/pull/99');
});

test('doctor — flags missing executor + testless runnable tasks; READY when configured', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `process.exit(0);`); // gh auth status → ok
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });

  // No executor + a runnable task with no locked test → two blockers.
  chalk(d, 'task', 'add', 'do a thing');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'it works'); // specd, but NO --test
  let r = chalk(d, 'doctor');
  assert.equal(r.code, 2, 'NOT READY');
  assert.match(r.out, /no protocol.executor.command/);
  assert.match(r.out, /NO locked test/);

  // Configure executor + lock a real test → READY.
  writeFileSync(join(d, 'spec.test.txt'), 'contract\n');
  chalk(d, 'spec', id, '--test', 'spec.test.txt');
  conf(d, (o) => { o.executor = { command: 'true' }; });
  r = chalk(d, 'doctor');
  assert.equal(r.code, 0, 'READY once executor + locked test exist');
  assert.match(r.out, /READY/);
});

test('smoke — refuses without --yes; --dry-run previews; GO when the real flow succeeds', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  // Fake GitHub: create→#7, list returns it, pr create→#77, pr/issue view report merged/closed.
  const ghCmd = stubGh(d, `const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('issue','create')) console.log('https://github.com/o/r/issues/7');
    else if(has('issue','list')) console.log(JSON.stringify([{number:7,title:'chalk smoke',url:'u',body:'- [ ] smoke',labels:[]}]));
    else if(has('issue','view')) console.log('CLOSED');
    else if(has('pr','create')) console.log('https://github.com/o/r/pull/77');
    else if(has('pr','view')) console.log('MERGED');
    else process.exit(0);`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n');`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });

  // Refuses without --yes.
  const refused = chalk(d, 'smoke', '--create');
  assert.equal(refused.code, 1);
  assert.match(refused.out, /refused/i);

  // --dry-run previews the target repo, no actions.
  const dry = chalk(d, 'smoke', '--dry-run');
  assert.equal(dry.code, 0);
  assert.match(dry.out, /chalkagents\/chalk-protocol|target repo/);
  assert.equal(existsSync(join(d, '.chalk/tasks.json')) ? tasksOf(d).length : 0, 0, 'dry-run created no tasks');

  // Real (stubbed) run → GO.
  const r = chalk(d, 'smoke', '--create', '--yes');
  assert.equal(r.code, 0, 'GO');
  assert.match(r.out, /GO — the pipeline works end-to-end/);
  assert.match(r.out, /PR #77 merged/);
  assert.match(r.out, /issue #7 closed/);
  const t = tasksOf(d).find((x) => x.issue?.number === 7);
  assert.equal(t.state, 'done');
  assert.equal(branchExists(d, t.branch), false, 'branch cleaned up');
});

test('pipeline --dry-run — plans without touching anything', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{number:1,title:'X',url:'u',body:'- [ ] y',labels:[]}]));`);
  conf(d, (o) => { o.github.command = ghCmd; });
  chalk(d, 'issue', 'pull');
  const before = readFileSync(join(d, '.chalk/tasks.json'), 'utf8');
  const r = chalk(d, 'pipeline', '--dry-run');
  assert.equal(r.code, 0);
  assert.match(r.out, /branch → work → commit → pr → review → evidence → merge/);
  assert.equal(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), before, 'dry-run is side-effect-free');
});

test('evidence command — runs the spec, commits screenshots, edits the PR body with blob URLs', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const editOut = join(d, 'pr-body.txt');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2);
    if(a.includes('pr')&&a.includes('create')) console.log('https://github.com/o/r/pull/42');
    else if(a.includes('pr')&&a.includes('view')) console.log('Original PR body');
    else if(a.includes('pr')&&a.includes('edit')) writeFileSync(${JSON.stringify(editOut)}, a[a.indexOf('--body')+1]);
    else console.log(JSON.stringify([{number:9,title:'Add thing',url:'u',body:'- [ ] x',labels:[]}]));`);
  // e2e runner emits a run.json with a screenshot data URL.
  writeFileSync(join(d, 'runspec.mjs'), `import {writeFileSync} from 'node:fs'; const a=process.argv; const out=a[a.indexOf('--out')+1];
    const png='data:image/png;base64,'+Buffer.from('SHOT').toString('base64');
    writeFileSync(out+'/run.json', JSON.stringify({runId:'r',specId:'spec-x',status:'passed',startedAt:1,steps:[{stepId:'s1',beforeScreenshot:png}]}));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.e2e = { command: `node ${join(d, 'runspec.mjs')}`, baseUrl: '', runsDir: '.chalk/runs' }; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const wt = tasksOf(d)[0].worktree;
  // The spec must exist where it's locked (primary) AND where it runs (worktree).
  const spec = 'apiVersion: chalk/v1\nkind: Test\nid: spec-x\nname: X\nsteps: []\n';
  mkdirSync(join(d, '.chalk/tests'), { recursive: true }); writeFileSync(join(d, '.chalk/tests/x.test.yaml'), spec);
  mkdirSync(join(wt, '.chalk/tests'), { recursive: true }); writeFileSync(join(wt, '.chalk/tests/x.test.yaml'), spec);
  chalk(d, 'spec', id, '--test', '.chalk/tests/x.test.yaml');
  writeFileSync(join(wt, 'feature.js'), 'export const f=1;\n');
  chalk(d, 'commit', id);
  chalk(d, 'pr', id);

  assert.equal(chalk(d, 'evidence', id).code, 0);
  assert.equal(tasksOf(d)[0].pipeline.stage, 'tested');
  assert.ok(existsSync(join(wt, '.chalk/evidence/9/before-s1.png')), 'screenshot PNG committed in the worktree');
  const body = readFileSync(editOut, 'utf8');
  assert.match(body, /Original PR body/, 'preserves the existing PR body');
  assert.match(body, /## Test evidence/);
  assert.match(body, /blob\/[0-9a-f]{7,}\/.chalk\/evidence\/9\/before-s1\.png/, 'embeds a commit-SHA blob URL');
});
