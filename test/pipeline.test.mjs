// Tests for the GitHub issue→merge pipeline. Hermetic: a real temp git repo + a STUB `gh`
// (a node script that records its args and returns canned output) — no network, no real merges.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { findRoot } from '../lib/store.mjs';
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
  assert.equal(proto.worktree.setup, '', 'worktree.setup default empty');
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
  // cleanup rewinds a non-done task to pre-branch so it is RE-RUNNABLE (Finding 3) — not stranded
  // at 'cleaned' with a stale branch field that makes the next `branch` no-op.
  assert.equal(t.pipeline.stage, 'selected', 'task rewound to re-runnable');
  assert.ok(!t.branch, 'branch field cleared');
  assert.equal(branchExists(d, 'feat/7-add-dark-mode'), false, 'local branch deleted');
});

test('single-canonical spine — a command run from a linked worktree resolves to the MAIN spine, even past a stale committed .chalk', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 4, title: 'Add X', url: 'u', body: '- [ ] do it', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  // Commit a STALE spine snapshot so the worktree checks out its OWN .chalk — the exact condition
  // (a committed .chalk in the worktree) that used to fork state. Then pull the task into MAIN only.
  execSync('git add -A .chalk && git commit -q -m "spine snapshot"', { cwd: d });
  chalk(d, 'issue', 'pull'); // MAIN's .chalk gains the task (uncommitted); the committed snapshot does NOT
  const id = tasksOf(d)[0].id.slice(0, 12);
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt = tasksOf(d)[0].worktree;
  assert.ok(existsSync(join(wt, '.chalk/tasks.json')), 'the worktree checked out its own (stale) committed spine');

  // Run a STATE-MUTATING command FROM THE WORKTREE. Option A must resolve it to MAIN's spine.
  assert.equal(chalk(wt, 'start', id).code, 0, 'the worktree command found the task on the MAIN spine');
  const mainTask = tasksOf(d)[0]; // reads MAIN d/.chalk/tasks.json
  assert.equal(mainTask.state, 'in-progress', 'the worktree command advanced the MAIN spine');
  assert.equal(mainTask.branch, tasksOf(d)[0].branch, 'branch field set from MAIN is intact — single spine, no fork');

  // The worktree's own (stale committed) copy must NOT have been advanced — proving only one spine is live.
  const wtCopy = JSON.parse(readFileSync(join(wt, '.chalk/tasks.json'), 'utf8'));
  assert.ok(!wtCopy.some((x) => x.id.startsWith(id) && x.state === 'in-progress'), 'the worktree copy was NOT mutated (it is ignored)');
});

test('findRoot — a chalk project NESTED in a worktree subdir maps to the SAME subdir in main, not the outer spine', () => {
  const d = repo();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  // an OUTER spine at the repo root AND a distinct nested project at apps/x — both committed so the
  // worktree checkout carries them. The nested project must NOT resolve to the outer root.
  mkdirSync(join(d, '.chalk'), { recursive: true }); writeFileSync(join(d, '.chalk/chalk.json'), '{"version":"1.0"}');
  mkdirSync(join(d, 'apps/x/.chalk'), { recursive: true }); writeFileSync(join(d, 'apps/x/.chalk/chalk.json'), '{"version":"1.0"}');
  g('add -A'); g('commit -q -m spine');
  const wt = join(scratch(), 'wt'); g(`worktree add ${wt} -b feat/x main`);
  const same = (a, b) => realpathSync(a) === realpathSync(b);
  assert.ok(same(findRoot(join(wt, 'apps/x')), join(d, 'apps/x')), 'nested worktree project → nested MAIN project');
  assert.ok(same(findRoot(wt), d), 'worktree root project → MAIN root');
});

test('findRoot — no redirect when the main checkout lacks a spine at that path (uses the worktree-local copy)', () => {
  const d = repo();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  mkdirSync(join(d, '.chalk'), { recursive: true }); writeFileSync(join(d, '.chalk/chalk.json'), '{"version":"1.0"}');
  g('add -A'); g('commit -q -m spine');
  const wt = join(scratch(), 'wt'); g(`worktree add ${wt} -b feat/y main`);
  rmSync(join(d, '.chalk'), { recursive: true, force: true }); // main spine gone at this path
  assert.ok(realpathSync(findRoot(wt)) === realpathSync(wt), 'falls back to the worktree-local spine — never a wrong outer one');
});

test('findRoot — outside any git repo, walks up to the nearest .chalk (no crash when git is absent)', () => {
  const base = scratch(); // a plain temp dir, NOT a git repo
  mkdirSync(join(base, 'proj/.chalk'), { recursive: true }); writeFileSync(join(base, 'proj/.chalk/chalk.json'), '{"version":"1.0"}');
  assert.ok(realpathSync(findRoot(join(base, 'proj/sub'))) === realpathSync(join(base, 'proj')), 'walk-up still works with no git');
});

test('worktree — held-out set is never copied into the worktree (no spine copy happens at all)', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  mkdirSync(join(d, '.chalk/held-out'), { recursive: true });
  writeFileSync(join(d, '.chalk/held-out/secret.test.mjs'), '// hidden assertions\n');
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt = tasksOf(d)[0].worktree;
  // The held-out set lives ONLY in the main checkout's uncommitted .chalk; the worktree (a code
  // sandbox, no spine copy) never receives it.
  assert.equal(existsSync(join(wt, '.chalk/held-out/secret.test.mjs')), false, 'held-out is never present in the worktree');
});

test('branch — recreates when the worktree dir was removed out-of-band (stale branch field)', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt1 = tasksOf(d)[0].worktree;
  // nuke the worktree dir behind chalk's back — branch + stage='branched' remain on the task.
  rmSync(wt1, { recursive: true, force: true });
  assert.equal(tasksOf(d)[0].pipeline.stage, 'branched', 'task still thinks it is branched');
  // re-branch must detect the missing worktree and recreate (not no-op on the stale field).
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt2 = tasksOf(d)[0].worktree;
  assert.ok(wt2 && existsSync(wt2), 're-branch recreated the worktree after out-of-band removal');
});

test('worktree setup — the bootstrap hook runs in the worktree before work; a failure blocks at branch', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch();
  // setup writes a sentinel INTO the worktree (cwd) — proves it ran there, before work/verify
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.worktree.setup = `node -e "require('fs').writeFileSync('.bootstrapped','ok')"`; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  assert.equal(chalk(d, 'branch', id).code, 0);
  assert.ok(existsSync(join(tasksOf(d)[0].worktree, '.bootstrapped')), 'setup ran in the worktree');

  // a failing setup must FAIL the branch stage with a clear, diagnosable reason
  chalk(d, 'cleanup', id);
  conf(d, (o) => { o.worktree.setup = 'node -e "process.exit(1)"'; });
  const r = chalk(d, 'branch', id);
  assert.notEqual(r.code, 0, 'a failed setup fails the branch stage');
  assert.match(r.out, /worktree setup failed/);
});

test('cleanup then re-branch — a cleaned-up task is re-runnable (recreates the worktree)', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt1 = tasksOf(d)[0].worktree;
  assert.ok(existsSync(wt1));
  assert.equal(chalk(d, 'cleanup', id).code, 0);
  assert.equal(existsSync(wt1), false, 'worktree removed by cleanup');
  // re-branch must RECREATE, not no-op on a stale branch field (Finding 3)
  assert.equal(chalk(d, 'branch', id).code, 0);
  const wt2 = tasksOf(d)[0].worktree;
  assert.ok(wt2 && existsSync(wt2), 're-branch recreated the worktree');
  assert.equal(tasksOf(d)[0].pipeline.stage, 'branched');
});

test('test-enforcement gate — a feature whose change has NO test blocks at work (verify can pass vacuously)', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
  // executor writes CODE ONLY — no test. verify is unconfigured → vacuously green.
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n');`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id);
  const r = chalk(d, 'work', id);
  assert.notEqual(r.code, 0, 'work blocks a code-only feature change');
  assert.match(r.out, /no test in the change/);
  assert.notEqual(tasksOf(d)[0].pipeline.stage, 'verified', 'did not advance past work');
});

test('test-enforcement gate — a test in the change satisfies it; exempt (docs / skip-test) needs none; off when disabled', () => {
  const mk = (issue, execBody, tweak = () => {}) => {
    const d = repoWithBare();
    chalk(d, 'init', '--name', 'p');
    const ghCmd = stubGh(d, `console.log(JSON.stringify([${issue}]));`);
    writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} ${execBody}`);
    const wtbase = scratch();
    conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; tweak(o); });
    chalk(d, 'issue', 'pull');
    const id = tasksOf(d)[0].id.slice(0, 12);
    chalk(d, 'branch', id);
    return { d, code: chalk(d, 'work', id).code };
  };
  const feat = `{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }`;
  // (1) code + a Dart-style test in the diff → satisfied.
  assert.equal(mk(feat, `writeFileSync('feature.dart','x');writeFileSync('feature_test.dart','// asserts');`).code, 0, 'a test in the diff satisfies the gate');
  // (2) a documentation issue → branchType docs → exempt, no test needed.
  assert.equal(mk(`{ number: 7, title: 'Docs', url: 'u', body: '- [ ] do', labels: [{ name: 'documentation' }] }`, `writeFileSync('README.md','docs');`).code, 0, 'docs change is exempt');
  // (3) requireTest disabled → no test needed.
  assert.equal(mk(feat, `writeFileSync('feature.js','x');`, (o) => { o.requireTest = false; }).code, 0, 'gate off when requireTest=false');
});

test('break-it gate (lever 3) — a vacuous locked test blocks at work; a real one passes; OFF when unset', () => {
  // Drives the real issue→branch→work path so the WIRING (bin/chalk.mjs) is exercised, not just the
  // probe: reverting the wiring would make these fail. In the worktree the spine is single-canonical,
  // so changedPaths sees only the executor's code — exactly the production condition.
  const mk = ({ base = {}, exec, assertBody, breakOn = true }) => {
    const d = repoWithBare();
    chalk(d, 'init', '--name', 'p');
    const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
    for (const [p, c] of Object.entries(base)) writeFileSync(join(d, p), c);
    writeFileSync(join(d, 'acc.test.mjs'), assertBody);
    g(`add ${[...Object.keys(base), 'acc.test.mjs'].join(' ')}`); g('commit -m base'); g('push origin main');
    writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} ${exec}`);
    const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 7, title: 'Add X', url: 'u', body: '- [ ] do', labels: [{ name: 'enhancement' }] }]));`);
    const wtbase = scratch();
    conf(d, (o) => {
      o.github.command = ghCmd; o.worktree.dir = wtbase;
      o.executor = { command: `node ${join(d, 'exec.mjs')}` };
      o.verify = { test: 'node --test acc.test.mjs' };   // verify is green in every case → the gate is what differs
      o.breakTest = breakOn ? 'node --test {test}' : '';
    });
    chalk(d, 'issue', 'pull');
    const id = tasksOf(d)[0].id.slice(0, 12);
    chalk(d, 'spec', id, '--test', 'acc.test.mjs');       // lock the acceptance test (the thing break-it probes)
    chalk(d, 'branch', id);
    const r = chalk(d, 'work', id);
    return { code: r.code, out: r.out, stage: tasksOf(d)[0].pipeline?.stage };
  };
  const VACUOUS = `import {test} from 'node:test'; import assert from 'node:assert'; test('t',()=>assert.equal(1,1));\n`;
  const ASSERTS = `import {test} from 'node:test'; import assert from 'node:assert'; import {f} from './feature.mjs'; test('t',()=>assert.equal(f(),1));\n`;
  const WRITE1 = `writeFileSync('feature.mjs','export const f=()=>1;\\n');`;

  // (1) VACUOUS — the locked test passes whether or not the change is present → blocks.
  const vac = mk({ exec: WRITE1, assertBody: VACUOUS });
  assert.notEqual(vac.code, 0, 'a vacuous locked test blocks work');
  assert.match(vac.out, /vacuous locked test/);
  assert.notEqual(vac.stage, 'verified', 'did not advance past work');

  // (2) NON-VACUOUS — the locked test asserts the change, so it fails on the reverted base → passes.
  const real = mk({ base: { 'feature.mjs': 'export const f=()=>0;\n' }, exec: WRITE1, assertBody: ASSERTS });
  assert.equal(real.code, 0, 'a test that asserts the change passes the gate');
  assert.equal(real.stage, 'verified', 'advanced past work');

  // (3) OFF — same vacuous test, but breakTest unset → gate skipped → work proceeds (opt-in).
  const off = mk({ exec: WRITE1, assertBody: VACUOUS, breakOn: false });
  assert.equal(off.code, 0, 'gate is OFF when breakTest is unset');
});

test('work+verify run in the worktree — executor edits + gates resolve there, not in primary', () => {
  const d = repo();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `console.log(JSON.stringify([{ number: 3, title: 'feature', url: 'u', body: '- [ ] do it', labels: [] }]));`);
  const wtbase = scratch();
  // executor writes impl.txt in its cwd; verify (check.mjs) passes iff impl.txt exists in cwd.
  // also writes a test file so the test-enforcement gate is satisfied (feature change ships a test).
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync, readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('impl.txt','ok'); writeFileSync('impl_test.mjs','// asserts impl');`);
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
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
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

test('pipeline — idempotent stages: an interrupted sweep resumes with no duplicate branch/commit/PR', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  // Stub gh: RECORD every `pr create` (one line per call) so we can assert it fires exactly once,
  // and record `pr merge`. Anything else → the issue list.
  const prCreates = join(d, 'pr-creates.txt');
  const merged = join(d, 'merged.txt');
  const ghCmd = stubGh(d, `import {appendFileSync,writeFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')){ appendFileSync(${JSON.stringify(prCreates)}, 'create\\n'); console.log('https://github.com/o/r/pull/42'); }
    else if(has('pr','merge')) writeFileSync(${JSON.stringify(merged)}, a.join(' '));
    else if(has('pr','view')) console.log('MERGED');
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  // Executor writes feature.js once; if it (wrongly) re-ran it would still only rewrite the same file.
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });

  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);

  // (1) Drive the sweep PARTWAY — through pr-open — via the discrete stage commands, then "interrupt".
  assert.equal(chalk(d, 'branch', id).code, 0);
  assert.equal(chalk(d, 'work', id).code, 0);
  assert.equal(chalk(d, 'commit', id).code, 0);
  assert.equal(chalk(d, 'pr', id).code, 0);
  assert.equal(tasksOf(d)[0].pipeline.stage, 'pr-open', 'partial run stopped at pr-open');
  const branch = tasksOf(d)[0].branch;
  const wt = tasksOf(d)[0].worktree;
  const featCommits = (s) => (s.match(/feat: add feature/g) || []).length;
  assert.equal(featCommits(execSync('git log --oneline', { cwd: wt, encoding: 'utf8' })), 1, 'one feature commit so far');
  assert.equal(readFileSync(prCreates, 'utf8').trim().split('\n').filter(Boolean).length, 1, 'one pr create so far');

  // (2) Re-run the FULL pipeline. Without the per-stage guards, `commit` would die ("nothing to
  // commit") and block the task, and/or `pr` would file a DUPLICATE PR. With them it resumes cleanly.
  const r = chalk(d, 'pipeline');
  assert.equal(r.code, 0, 'resumed pipeline completes with no blocked tasks');

  // (3) Assert COMPOSED across stages (per the recorded lesson): no dup commit, no dup PR, one branch, done.
  // The worktree was torn down by merge, so count commits on the pushed remote branch (the squash
  // stub doesn't delete the remote ref): exactly one feature commit means no duplicate on resume.
  execSync(`git fetch origin ${branch}`, { cwd: d, stdio: 'pipe' });
  const log = execSync('git log --oneline FETCH_HEAD', { cwd: d, encoding: 'utf8' });
  assert.equal(featCommits(log), 1, 'still exactly ONE feature commit — no duplicate commit on resume');
  assert.equal(readFileSync(prCreates, 'utf8').trim().split('\n').filter(Boolean).length, 1, 'gh pr create fired exactly ONCE — no duplicate PR');
  assert.ok(existsSync(merged), 'gh pr merge was called');

  const t = tasksOf(d)[0];
  assert.equal(t.state, 'done', 'task still reaches done');
  assert.equal(t.pipeline.stage, 'cleaned');
  assert.ok(!t.worktree, 'worktree torn down');
  assert.equal(branchExists(d, branch), false, 'the single local branch was cleaned up (no stray duplicate)');
});

test('pipeline — idempotent review stage: a resumed sweep does NOT re-invoke the reviewer or duplicate the verdict', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/42');
    else if(has('pr','merge')) writeFileSync(${JSON.stringify(join(d, 'merged.txt'))}, a.join(' '));
    else if(has('pr','view')) console.log('MERGED');
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
  // Reviewer that RECORDS each invocation (one line per call) and always passes — so we can assert
  // it fires exactly once across an interrupt+resume.
  const revCalls = join(d, 'rev-calls.txt');
  writeFileSync(join(d, 'rev.mjs'), `import {appendFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} appendFileSync(${JSON.stringify(revCalls)}, 'x\\n'); console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });

  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  const revCount = () => (existsSync(revCalls) ? readFileSync(revCalls, 'utf8').trim().split('\n').filter(Boolean).length : 0);

  // (1) Drive through a PASSING review, then "interrupt".
  for (const stage of ['branch', 'work', 'commit', 'pr', 'review']) assert.equal(chalk(d, stage, id).code, 0, `${stage} ok`);
  assert.equal(tasksOf(d)[0].pipeline.stage, 'reviewed', 'review advanced the stage to reviewed');
  assert.equal(tasksOf(d)[0].reviews.length, 1, 'one review on record after first pass');
  assert.equal(revCount(), 1, 'reviewer invoked exactly once');

  // (2) Re-run review directly (resume) → it must short-circuit: no second invocation, no dup record.
  assert.equal(chalk(d, 'review', id).code, 0, 'resumed review short-circuits with exit 0');
  assert.equal(revCount(), 1, 'reviewer NOT re-invoked on resume');
  assert.equal(tasksOf(d)[0].reviews.length, 1, 'no duplicate review record on resume');

  // (3) Re-run the full pipeline to completion — still exactly one review, task reaches done.
  assert.equal(chalk(d, 'pipeline').code, 0, 'resumed pipeline completes');
  assert.equal(revCount(), 1, 'still exactly one reviewer invocation after full resume');
  const t = tasksOf(d)[0];
  assert.equal(t.reviews.length, 1, 'still exactly one review record');
  assert.equal(t.state, 'done', 'task reaches done');
  assert.equal(t.pipeline.stage, 'cleaned');
});

test('pipeline — a failed review blocks with the reviewer finding text and retries once before blocking', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/42');
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
  // Reviewer that RECORDS each invocation and ALWAYS blocks with a unique finding note.
  const revCalls = join(d, 'rev-calls.txt');
  writeFileSync(join(d, 'rev.mjs'), `import {appendFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} appendFileSync(${JSON.stringify(revCalls)}, 'x\\n'); console.log(JSON.stringify({verdict:'block',findings:[{severity:'high',area:'correctness',note:'UNIQUE_FINDING_TEXT'}]}));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });

  chalk(d, 'issue', 'pull');
  const r = chalk(d, 'pipeline');
  assert.equal(r.code, 2, 'pipeline exits 2 when it leaves a task blocked (it does not halt the whole run)');

  const t = tasksOf(d)[0];
  assert.equal(t.state, 'blocked', 'a failed review blocks the task');
  assert.match(t.block.reason, /UNIQUE_FINDING_TEXT/, 'block reason surfaces the reviewer finding text');
  assert.doesNotMatch(t.block.reason, /pipeline stage 'review' failed/, 'not the generic stage-failed reason');
  // Retried once before auto-blocking → the reviewer was invoked twice.
  const revCount = readFileSync(revCalls, 'utf8').trim().split('\n').filter(Boolean).length;
  assert.equal(revCount, 2, 'review stage retried once before blocking');
});

test('pipeline — a TRANSIENT review failure recovers on retry: the task is not wedged and proceeds to merge', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/42');
    else if(has('pr','merge')) writeFileSync(${JSON.stringify(join(d, 'merged.txt'))}, a.join(' '));
    else if(has('pr','view')) console.log('MERGED');
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
  // Reviewer that BLOCKS on the first call but PASSES on the second — a transient/non-deterministic
  // failure. Recovery means: it must NOT wedge the task; the retry passes and the sweep proceeds.
  const revState = join(d, 'rev-state.txt');
  writeFileSync(join(d, 'rev.mjs'), `import {existsSync,writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} const f=${JSON.stringify(revState)}; const n=existsSync(f)?Number(readFileSync(f,'utf8')):0; writeFileSync(f,String(n+1));
    if(n===0) console.log(JSON.stringify({verdict:'block',findings:[{severity:'low',area:'correctness',note:'transient blip'}]}));
    else console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });

  chalk(d, 'issue', 'pull');
  const r = chalk(d, 'pipeline');
  assert.equal(r.code, 0, 'pipeline exits 0 — the transient failure recovered, nothing left blocked');

  const t = tasksOf(d)[0];
  assert.notEqual(t.state, 'blocked', 'a transient review failure does NOT wedge the task');
  assert.equal(t.state, 'done', 'the task recovered and was driven all the way to done');
  assert.equal(Number(readFileSync(revState, 'utf8')), 2, 'reviewer ran twice (blocked then passed on retry)');
  assert.ok(existsSync(join(d, 'merged.txt')), 'the recovered task merged');
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
  assert.match(r.out, /no locked test/i);

  // Configure executor + lock a real test → READY.
  writeFileSync(join(d, 'spec.test.txt'), 'contract\n');
  chalk(d, 'spec', id, '--test', 'spec.test.txt');
  conf(d, (o) => { o.executor = { command: 'true' }; });
  r = chalk(d, 'doctor');
  assert.equal(r.code, 0, 'READY once executor + locked test exist');
  assert.match(r.out, /READY/);

  // A toolchain verify command with no worktree.setup → a warning (a fresh worktree lacks packages).
  conf(d, (o) => { o.verify = { test: 'fvm flutter test' }; });
  r = chalk(d, 'doctor');
  assert.match(r.out, /worktree\.setup is empty/, 'warns when verify implies a toolchain but no setup');
  conf(d, (o) => { o.worktree.setup = 'flutter pub get'; });
  r = chalk(d, 'doctor');
  assert.doesNotMatch(r.out, /worktree\.setup is empty/, 'no warning once setup is configured');
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
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts feature\\n');`);
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

test('autopilot — aborts when not ready, runs one sweep when reviewer-gated, skips when locked', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('issue','list')) console.log(JSON.stringify([{number:5,title:'do thing',url:'u',body:'- [ ] x',labels:[]}]));
    else if(has('pr','create')) console.log('https://github.com/o/r/pull/55');
    else process.exit(0);`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('f.js','x\\n'); writeFileSync('f.test.js','// t\\n');`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });
  chalk(d, 'issue', 'pull');

  // (1) No reviewer → doctor FAILS on the testless task → autopilot aborts; pipeline never ran.
  let r = chalk(d, 'autopilot', '--max', '1');
  assert.equal(r.code, 2, 'NOT READY without a reviewer backstop');
  assert.match(r.out, /NOT READY/);
  assert.equal(tasksOf(d)[0].state, 'specd', 'pipeline did not run');

  // (2) Add a passing reviewer + a retro agent → autopilot runs the sweep, merges, and self-heals.
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  writeFileSync(join(d, 'rt.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({lessons:['the sweep ran clean'], issues:[]}));`);
  conf(d, (o) => { o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; o.retro = { command: `node ${join(d, 'rt.mjs')}` }; });
  r = chalk(d, 'autopilot', '--max', '1');
  assert.equal(r.code, 0);
  assert.match(r.out, /1 merged/);
  assert.equal(tasksOf(d)[0].state, 'done', 'task driven to done');
  // retro ran at the end of the sweep (regression: spawnSync must be imported in autopilot).
  assert.match(readFileSync(join(d, '.chalk/lessons.md'), 'utf8'), /the sweep ran clean/, 'autopilot ran retro');

  // (3) A fresh lock → the next run self-skips (single-flight).
  mkdirSync(join(d, '.chalk/local'), { recursive: true });
  writeFileSync(join(d, '.chalk/local/autopilot.lock'), new Date().toISOString());
  r = chalk(d, 'autopilot');
  assert.match(r.out, /in progress — skipping/);
});

test('loop — bounded standing loop drives a round, then stops at steady state before the round cap', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  // gh always lists the same one issue (#5); `chalk issue pull` dedupes, so round 2 pulls 0 → steady state.
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('issue','list')) console.log(JSON.stringify([{number:5,title:'do thing',url:'u',body:'- [ ] x',labels:[]}]));
    else if(has('pr','create')) console.log('https://github.com/o/r/pull/55');
    else if(has('pr','merge')) writeFileSync(${JSON.stringify(join(d, 'merged.txt'))}, a.join(' '));
    else if(has('pr','view')) console.log('MERGED');
    else process.exit(0);`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('f.js','x\\n'); writeFileSync('f.test.js','// t\\n');`);
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  writeFileSync(join(d, 'rt.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({lessons:[], issues:[]}));`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; o.retro = { command: `node ${join(d, 'rt.mjs')}` }; });

  const r = chalk(d, 'loop', '--max-rounds', '4', '--max', '1');
  assert.equal(r.code, 0);
  // Round 1 merges the issue; round 2 pulls 0 + merges 0 → steady state → stop (well before 4 rounds).
  assert.match(r.out, /round 1: pulled 1, merged 1/);
  assert.match(r.out, /steady state after 2 round\(s\)/);
  assert.match(r.out, /1 merged.*over 2 round\(s\)/s);
  assert.equal(tasksOf(d)[0].state, 'done', 'the issue was driven to done');
  assert.ok(existsSync(join(d, 'merged.txt')), 'a merge happened');
});

test('plan stage — the planner output is stored on the task and injected into context', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  // stub planner: ignores stdin, prints a plan to stdout.
  writeFileSync(join(d, 'planner.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log('**Approach:** add the flag\\n**Steps:** 1. edit bin\\n**Test:** asserts the flag');`);
  conf(d, (o) => { o.planner = { command: `node ${join(d, 'planner.mjs')}` }; });
  chalk(d, 'task', 'add', 'add a flag');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'the flag works');
  chalk(d, 'start', id);

  assert.equal(chalk(d, 'plan', id).code, 0);
  const t = tasksOf(d)[0];
  assert.match(t.plan, /Approach:.*add the flag/, 'plan stored on the task');
  assert.equal(t.pipeline.stage, 'planned');
  assert.match(chalk(d, 'context', id).out, /Plan \(implement this/, 'plan injected into the executor context');

  // The planner call was logged to the cost ledger, and `chalk cost` summarizes it.
  assert.ok(existsSync(join(d, '.chalk/local/cost.jsonl')), 'cost ledger written');
  const rec = JSON.parse(readFileSync(join(d, '.chalk/local/cost.jsonl'), 'utf8').trim().split('\n')[0]);
  assert.equal(rec.agent, 'planner');
  assert.equal(typeof rec.ms, 'number');
  assert.match(chalk(d, 'cost').out, /planner/);
});

test('retro — appends lessons + files deduped improvement issues; --dry-run is inert', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const created = join(d, 'created.txt');
  const ghCmd = stubGh(d, `import {appendFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('issue','list')) console.log(JSON.stringify([{title:'existing open issue'}]));
    else if(has('issue','create')) appendFileSync(${JSON.stringify(created)}, a.join(' ')+'\\n');
    else process.exit(0);`);
  writeFileSync(join(d, 'retro.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({lessons:['always clean up the worktree after merge'], issues:[{title:'fix: improve the error message',body:'- [ ] do it',labels:['bug']},{title:'existing open issue',body:'dup'}]}));`);
  conf(d, (o) => { o.github.command = ghCmd; o.retro = { command: `node ${join(d, 'retro.mjs')}` }; });

  // dry-run: nothing changes.
  let r = chalk(d, 'retro', '--dry-run');
  assert.equal(r.code, 0);
  assert.match(r.out, /would file:.*improve the error/);
  assert.ok(!existsSync(created), 'dry-run filed nothing');
  assert.ok(!readFileSync(join(d, '.chalk/lessons.md'), 'utf8').includes('clean up the worktree'), 'dry-run appended no lesson');

  // real: lesson appended, the new issue filed, the duplicate skipped.
  r = chalk(d, 'retro');
  assert.equal(r.code, 0);
  assert.match(readFileSync(join(d, '.chalk/lessons.md'), 'utf8'), /clean up the worktree/, 'lesson appended');
  const filed = readFileSync(created, 'utf8');
  assert.match(filed, /improve the error message/, 'the new issue was filed');
  assert.ok(!/existing open issue/.test(filed), 'the duplicate issue was skipped');
  assert.match(r.out, /issue\(s\) filed/);
  // the lesson is now in the agent context (closes the loop).
  assert.match(chalk(d, 'context').out, /clean up the worktree/);
});

test('retro convergence guard — defers below-floor issues by default, files them at --min-severity low, writes the marker', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const created = join(d, 'created.txt');
  const ghCmd = stubGh(d, `import {appendFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('issue','list')) console.log('[]');
    else if(has('issue','create')) appendFileSync(${JSON.stringify(created)}, a.join(' ')+'\\n');
    else process.exit(0);`);
  // Retro emits one HIGH (real bug) + one LOW (cosmetic). The high files by default; the low is deferred.
  writeFileSync(join(d, 'retro.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({lessons:[], issues:[
    {title:'fix: a real wedge bug',body:'- [ ] x',severity:'high',labels:['bug']},
    {title:'docs: tidy a help string',body:'- [ ] y',severity:'low',labels:['enhancement']}]}));`);
  conf(d, (o) => { o.github.command = ghCmd; o.retro = { command: `node ${join(d, 'retro.mjs')}` }; });

  // (1) Default floor (med): files the high, defers the low.
  let r = chalk(d, 'retro');
  assert.equal(r.code, 0);
  let filed = readFileSync(created, 'utf8');
  assert.match(filed, /a real wedge bug/, 'high-severity issue filed at default floor');
  assert.ok(!/tidy a help string/.test(filed), 'low-severity issue deferred at default floor');
  assert.match(r.out, /defer \(below med\): docs: tidy/, 'deferral is reported');
  // marker reflects 1 filed, 1 deferred, not converged.
  const m1 = JSON.parse(readFileSync(join(d, '.chalk/local/retro-last.json'), 'utf8'));
  assert.equal(m1.filed, 1); assert.equal(m1.deferred, 1); assert.equal(m1.converged, false);

  // (2) --min-severity low: now the cosmetic one files too.
  r = chalk(d, 'retro', '--min-severity', 'low');
  assert.equal(r.code, 0);
  filed = readFileSync(created, 'utf8');
  assert.match(filed, /tidy a help string/, 'low-severity issue files when floor is lowered');
});

test('retro convergence marker — a clean run (no fileable issues) records converged:true', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `const a=process.argv.slice(2); if(a.includes('list')) console.log('[]'); else process.exit(0);`);
  // Only a low-severity nit → deferred at default floor → nothing filed → converged.
  writeFileSync(join(d, 'retro.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} console.log(JSON.stringify({lessons:['stay tidy'], issues:[{title:'docs: nit',body:'- [ ] z',severity:'low'}]}));`);
  conf(d, (o) => { o.github.command = ghCmd; o.retro = { command: `node ${join(d, 'retro.mjs')}` }; });
  const r = chalk(d, 'retro');
  assert.equal(r.code, 0);
  assert.match(r.out, /converged/, 'a sweep that files nothing reports converged');
  const m = JSON.parse(readFileSync(join(d, '.chalk/local/retro-last.json'), 'utf8'));
  assert.equal(m.filed, 0); assert.equal(m.converged, true);
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
  assert.match(r.out, /branch → plan → work → commit → pr → review → evidence → merge/);
  assert.equal(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'), before, 'dry-run is side-effect-free');
});

test('pipeline — a failed non-review stage surfaces the subprocess\'s error output in the block reason and log', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const ghCmd = stubGh(d, `const a=process.argv.slice(2); const has=(...xs)=>xs.every(x=>a.includes(x));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/42');
    else console.log(JSON.stringify([{number:7,title:'Add feature',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  // Executor makes NO file change → the `commit` stage dies with a unique, deterministic stderr
  // ("nothing to commit — the executor made no file changes…"), which is the failed stage's output.
  // requireTest off here so the (deliberately empty) change reaches commit instead of the work gate.
  writeFileSync(join(d, 'exec.mjs'), `import {readFileSync} from 'node:fs'; try{readFileSync(0)}catch{}`);
  const wtbase = scratch();
  conf(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; o.requireTest = false; });

  chalk(d, 'issue', 'pull');
  const r = chalk(d, 'pipeline');
  assert.equal(r.code, 2, 'pipeline exits 2 — it left a task blocked');

  const t = tasksOf(d)[0];
  assert.equal(t.state, 'blocked', 'the failed commit stage blocked the task');
  assert.match(t.block.reason, /nothing to commit/, 'block reason carries the failed stage\'s actual error output');
  assert.match(t.block.reason, /pipeline stage 'commit' failed/, 'still names the failed stage');
  assert.match(r.out, /nothing to commit/, 'the captured stage output appears in the sweep transcript/log');
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
