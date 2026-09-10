import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { localMergeHead } from '../lib/merge-candidate.mjs';
import { captureApproval } from '../lib/approval-inputs.mjs';
const CLI = resolve('bin/chalk.mjs');

for (const mode of ['unpublished', 'follow-up', 'dirty', 'file-mode', 'clean-filter', 'assume-unchanged', 'skip-worktree', 'visible-lock', 'untracked-lock', 'replaced', 'unknown', 'queued', 'published', 'merged-recovery']) test(`merge admits only the published and merged approved commit (${mode})`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-merge-candidate-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'), bare = join(parent, 'remote'), marker = join(parent, 'merged'), previous = join(parent, 'previous');
  for (const dir of [root, bare]) fs.mkdirSync(dir);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'source.txt'), '1');
  fs.writeFileSync(join(root, '.chalk/visible.cjs'), '1');
  fs.writeFileSync(join(root, 'check.cjs'), `require('assert').equal(require('fs').readFileSync('source.txt','utf8'),'2');`);
  fs.writeFileSync(join(root, 'gh.cjs'), `const fs=require('fs'),cp=require('child_process'),a=process.argv.slice(2),bare=${JSON.stringify(bare)},marker=${JSON.stringify(marker)},mode=${JSON.stringify(mode)};
const g=(...args)=>cp.execFileSync('git',['--git-dir',bare,...args],{encoding:'utf8',stdio:'pipe'}).trim(),head=()=>fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker)).head:g('rev-parse','refs/heads/feature');
if(a.includes('checks'))console.log('[{"bucket":"pass"}]');
else if(a.includes('view'))console.log(JSON.stringify(mode==='unknown'?{}:{headRefOid:head(),state:fs.existsSync(marker)?'MERGED':'OPEN'}));
else if(a.includes('merge')){if(mode==='merged-recovery'){fs.writeFileSync(marker,JSON.stringify({...JSON.parse(fs.readFileSync(marker)),args:a}));process.exit(7);}if(mode==='replaced')g('update-ref','refs/heads/feature',fs.readFileSync(${JSON.stringify(previous)},'utf8'));const expected=a[a.indexOf('--match-head-commit')+1];if(expected!==head())process.exit(9);if(mode==='queued')process.exit(0);g('update-ref','refs/heads/main',head());fs.writeFileSync(marker,JSON.stringify({head:head(),value:g('show',head()+':source.txt'),args:a}));}`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.review = { requiredAt: ['per-task'] }; meta.protocol.github = { command: 'node gh.cjs', ciPollAttempts: 0 }; store.saveMeta(meta);
  git(bare, 'init', '--bare', '-b', 'main'); git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'config', 'user.name', 'Fixture');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'old'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main'); git(root, 'switch', '-c', 'feature'); git(root, 'push', '-u', 'origin', 'feature');
  fs.writeFileSync(previous, git(root, 'rev-parse', 'HEAD')); fs.writeFileSync(join(root, 'source.txt'), '2');
  const hiddenChange = ['assume-unchanged', 'skip-worktree'].includes(mode);
  if (hiddenChange) { git(root, 'update-index', '--' + mode, 'source.txt'); assert.equal(git(root, 'diff', 'HEAD', '--', 'source.txt'), '', 'the ordinary diff really hides the changed input'); }
  if (mode !== 'dirty' && !hiddenChange) { git(root, 'add', 'source.txt'); git(root, 'commit', '-qm', 'approved'); }
  if (!['dirty', 'unpublished', 'follow-up'].includes(mode) && !hiddenChange) git(root, 'push', 'origin', 'feature');
  if (mode === 'visible-lock') fs.writeFileSync(join(root, '.chalk/visible.cjs'), '2');
  if (mode === 'untracked-lock') fs.writeFileSync(join(root, '.chalk/new-visible.cjs'), '2');
  if (mode === 'file-mode') {
    git(root, 'config', 'core.fileMode', 'false'); fs.chmodSync(join(root, 'source.txt'), 0o755);
    assert.equal(git(root, 'diff', 'HEAD', '--', 'source.txt'), '', 'Git hides executable mode changes');
  }
  if (mode === 'clean-filter') {
    fs.writeFileSync(join(root, 'source.txt'), '1'); git(root, 'add', 'source.txt'); git(root, 'commit', '-qm', 'different committed bytes'); git(root, 'push', 'origin', 'feature');
    git(root, 'config', 'filter.fixture.clean', 'printf 1'); fs.writeFileSync(join(root, '.git/info/attributes'), 'source.txt filter=fixture\n');
    fs.writeFileSync(join(root, 'source.txt'), '2');
    assert.equal(git(root, 'diff', 'HEAD', '--', 'source.txt'), '', 'Git clean filter hides different working bytes');
  }
  const head = git(root, 'rev-parse', 'HEAD');
  const task = { id: 'task-candidate', title: 'chore: candidate', state: 'in-progress', branch: 'feature', acceptanceCriteria: [{ text: 'publish value 2' }], tests: [], pr: { number: 7, recorded: true, lgtm: true }, reviews: [] };
  if (mode === 'visible-lock') task.tests = [store.lockTest(join(root, '.chalk/visible.cjs'))];
  if (mode === 'untracked-lock') task.tests = [store.lockTest(join(root, '.chalk/new-visible.cjs'))];
  if (mode === 'follow-up') task.pipeline = { stage: 'reviewed' };
  if (mode === 'merged-recovery') {
    task.specRevision = 1; task.specRevisions = [{ kind: 'amendment' }];
    fs.writeFileSync(marker, JSON.stringify({ head, value: '2', args: [] }));
    git(bare, 'update-ref', 'refs/heads/main', head); git(bare, 'update-ref', '-d', 'refs/heads/feature');
  }
  task.reviews.push({ verdict: 'pass', approval: captureApproval(store, 'review', task) }); store.upsertTask(task);
  let result = spawnSync(process.execPath, [CLI, 'merge', task.id], { cwd: root, encoding: 'utf8' });
  if (mode === 'follow-up') {
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /chalk pr/); assert.equal(fs.existsSync(marker), false);
    const published = spawnSync(process.execPath, [CLI, 'pr', task.id], { cwd: root, encoding: 'utf8' });
    assert.equal(published.status, 0, published.stdout + published.stderr); assert.equal(store.task(task.id).pr.number, 7);
    assert.equal(git(bare, 'rev-parse', 'refs/heads/feature'), head);
    result = spawnSync(process.execPath, [CLI, 'merge', task.id], { cwd: root, encoding: 'utf8' });
  }
  if (mode === 'published' || mode === 'merged-recovery' || mode === 'follow-up') {
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(store.task(task.id).state, 'done');
    const merged = JSON.parse(fs.readFileSync(marker)); assert.equal(merged.head, head); assert.equal(merged.value, '2'); assert.ok(merged.args.includes('--match-head-commit'));
  } else {
    assert.notEqual(result.status, 0, result.stdout + result.stderr); assert.equal(store.task(task.id).state, 'in-progress'); assert.equal(fs.existsSync(marker), false);
    assert.match(result.stdout + result.stderr, /chalk (?:pr|commit|merge)/);
    if (hiddenChange) {
      assert.match(result.stdout + result.stderr, /index flags can hide/);
      for (const flag of ['--no-assume-unchanged', '--no-skip-worktree', '--no-fsmonitor-valid']) git(root, 'update-index', flag, '--', 'source.txt');
      git(root, 'add', 'source.txt'); git(root, 'commit', '-qm', 'publish actual input'); git(root, 'push', 'origin', 'feature');
      const recovered = spawnSync(process.execPath, [CLI, 'merge', task.id], { cwd: root, encoding: 'utf8' });
      assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr); assert.equal(JSON.parse(fs.readFileSync(marker)).value, '2');
    }
  }
});

for (const mode of ['submodule', 'symlink', 'protected']) test(`raw candidate identity handles ${mode} inputs`, t => {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-raw-candidate-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'project'); fs.mkdirSync(root);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const init = cwd => { git(cwd, 'init', '-b', 'main'); git(cwd, 'config', 'user.email', 'fixture@example.invalid'); git(cwd, 'config', 'user.name', 'Fixture'); };
  execFileSync(process.execPath, [CLI, 'init', '--bare'], { cwd: root, stdio: 'ignore' }); init(root);
  fs.writeFileSync(join(root, 'source.txt'), 'one');
  const store = new Store(root), task = { id: 'task-raw', tests: [] };
  if (mode === 'symlink') fs.symlinkSync('source.txt', join(root, 'link'));
  if (mode === 'protected') {
    const meta = store.meta(); meta.protocol.regression = { dir: 'private-regressions' }; store.saveMeta(meta);
    fs.mkdirSync(join(root, 'private-regressions')); fs.writeFileSync(join(root, 'private-regressions/fixture'), 'private');
  }
  if (mode === 'submodule') {
    const child = join(parent, 'child'); fs.mkdirSync(child); init(child);
    fs.writeFileSync(join(child, 'source.txt'), 'one'); git(child, 'add', '.'); git(child, 'commit', '-qm', 'child');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', child, 'child');
  }
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate');
  assert.equal(localMergeHead(store, task), git(root, 'rev-parse', 'HEAD'));
  if (mode === 'symlink') {
    fs.unlinkSync(join(root, 'link')); fs.symlinkSync('another-target', join(root, 'link'));
    assert.throws(() => localMergeHead(store, task), /chalk commit/);
  } else if (mode === 'submodule') {
    git(root, 'config', 'submodule.child.ignore', 'all');
    git(join(root, 'child'), 'update-index', '--assume-unchanged', 'source.txt');
    fs.writeFileSync(join(root, 'child/source.txt'), 'two');
    assert.equal(git(root, 'diff', 'HEAD'), '');
    assert.throws(() => localMergeHead(store, task), /working input differs/);
    fs.writeFileSync(join(root, 'child/source.txt'), 'one');
    fs.writeFileSync(join(root, 'child/new.txt'), 'unpublished');
    assert.throws(() => localMergeHead(store, task), /uncommitted implementation inputs/);
  } else {
    fs.chmodSync(join(root, 'private-regressions/fixture'), 0);
    try { assert.equal(localMergeHead(store, task), git(root, 'rev-parse', 'HEAD')); }
    finally { fs.chmodSync(join(root, 'private-regressions/fixture'), 0o644); }
  }
});
