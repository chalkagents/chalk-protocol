import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { currentReview } from '../lib/approval-inputs.mjs';
import { captureReviewInputs, pinReviewBase } from '../lib/review-inputs.mjs';

const cli = resolve('bin/chalk.mjs');
const call = (cwd, exe, args) => spawnSync(exe, args, { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => { const r = call(cwd, 'git', args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const chalk = (cwd, ...args) => call(cwd, process.execPath, [cli, ...args]);
function fixture(t) {
  const top = mkdtempSync(join(tmpdir(), 'chalk-review-inputs-')), d = join(top, 'repo');
  mkdirSync(d); t.after(() => rmSync(top, { recursive: true, force: true }));
  git(d, 'init', '-q', '-b', 'main'); git(d, 'config', 'user.name', 'Test'); git(d, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(d, 'old.js'), 'export const unrelated = 1;\n');
  git(d, 'add', 'old.js'); git(d, 'commit', '-qm', 'unrelated previous work');
  return { d, top, task: { reviewBase: pinReviewBase(d) } };
}

test('new untracked files are reviewed instead of the unrelated last commit', t => {
  const { d, task } = fixture(t);
  writeFileSync(join(d, 'new feature.js'), 'export const intended = 2;\n');
  const r = captureReviewInputs(d, task);
  assert.deepEqual(r.files, ['new feature.js']); assert.deepEqual(r.untracked, r.files);
  assert.match(r.diff, /intended = 2/); assert.doesNotMatch(r.diff, /unrelated = 1/);
  assert.equal(r.base, task.reviewBase.commit); assert.equal(r.branch, 'main');
  const first = r.fingerprint;
  writeFileSync(join(d, 'new feature.js'), 'export const intended = 3;\n');
  assert.notEqual(captureReviewInputs(d, task).fingerprint, first);
});

test('one pinned base includes committed, staged, unstaged and untracked changes', t => {
  const { d, task } = fixture(t);
  writeFileSync(join(d, 'committed.js'), 'committed\n'); git(d, 'add', 'committed.js'); git(d, 'commit', '-qm', 'task part one');
  writeFileSync(join(d, 'staged.js'), 'staged\n'); git(d, 'add', 'staged.js');
  writeFileSync(join(d, 'old.js'), 'changed\n'); writeFileSync(join(d, 'untracked.js'), 'new\n');
  const r = captureReviewInputs(d, task, { github: { base: 'nonexistent' } });
  assert.deepEqual(r.files, ['committed.js', 'old.js', 'staged.js', 'untracked.js']);
  for (const line of ['+committed', '+staged', '+changed', '+new']) assert.ok(r.diff.includes(line));
  assert.equal(r.base, task.reviewBase.commit); assert.notEqual(r.head, r.base);
});

test('empty inputs stay empty; missing and invalid bases fail instead of selecting history', t => {
  const { d, task } = fixture(t);
  assert.equal(captureReviewInputs(d, task).diff, '');
  assert.throws(() => captureReviewInputs(d, {}), /missing task base/);
  assert.throws(() => pinReviewBase(d, 'HEAD~99'), /cannot resolve/);
  assert.throws(() => pinReviewBase(d, true), /requires/);
  assert.equal(captureReviewInputs(d, {}, { github: { base: 'main' } }).diff, '');
  git(d, 'checkout', '--orphan', 'other'); git(d, 'commit', '-qm', 'unrelated root');
  assert.throws(() => captureReviewInputs(d, task), /not an ancestor/);
});

test('legacy branches with disagreeing local and remote merge bases are refused', t => {
  const { d } = fixture(t);
  const old = git(d, 'rev-parse', 'HEAD');
  git(d, 'checkout', '-qb', 'feature'); writeFileSync(join(d, 'later.js'), 'later\n');
  git(d, 'add', 'later.js'); git(d, 'commit', '-qm', 'later');
  git(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.throws(() => captureReviewInputs(d, {}, { github: { base: 'main' } }), /ambiguous/);
  assert.equal(captureReviewInputs(d, { reviewBase: pinReviewBase(d, old) }).base, old);
});

test('spine and ignored output stay excluded; contract artifacts remain visible', t => {
  const { d, task } = fixture(t);
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  writeFileSync(join(d, '.chalk/tasks.json'), 'unrelated task');
  writeFileSync(join(d, '.chalk/tests/contract.yaml'), 'real contract');
  writeFileSync(join(d, '.gitignore'), '*.log\n'); writeFileSync(join(d, 'output.log'), 'runtime');
  const r = captureReviewInputs(d, task);
  assert.deepEqual(r.files, ['.chalk/tests/contract.yaml', '.gitignore']);
  assert.doesNotMatch(r.diff, /unrelated task|runtime/); assert.match(r.diff, /real contract/);
});

test('unresolved index conflicts fail preflight', t => {
  const { d, task } = fixture(t);
  git(d, 'checkout', '-qb', 'other'); writeFileSync(join(d, 'old.js'), 'other\n'); git(d, 'commit', '-qam', 'other');
  git(d, 'checkout', 'main'); writeFileSync(join(d, 'old.js'), 'main\n'); git(d, 'commit', '-qam', 'main');
  assert.notEqual(call(d, 'git', ['merge', 'other']).status, 0);
  assert.throws(() => captureReviewInputs(d, task), /unresolved merge conflicts/);
});

test('CLI preflight never invokes or retries the reviewer on an invalid base; explicit recovery records the actual manifest', t => {
  const { d, top } = fixture(t);
  git(d, 'commit', '--allow-empty', '-qm', 'task baseline');
  assert.equal(chalk(d, 'init', '--name', 'fixture').status, 0);
  const cfg = join(d, '.chalk/chalk.json'), config = JSON.parse(readFileSync(cfg));
  const counter = join(top, 'calls'), prompt = join(top, 'prompt');
  const runner = join(top, 'reviewer.mjs');
  writeFileSync(runner, `import {readFileSync,writeFileSync,appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(counter)}, 'call\\n'); writeFileSync(${JSON.stringify(prompt)}, readFileSync(0)); console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  config.protocol.review = { command: `${process.execPath} ${runner}`, requiredAt: ['per-task'] };
  config.protocol.github.base = 'missing'; writeFileSync(cfg, JSON.stringify(config));
  chalk(d, 'task', 'add', 'fix: intended');
  const tasks = join(d, '.chalk/tasks.json'), id = JSON.parse(readFileSync(tasks))[0].id;
  chalk(d, 'spec', id, '--criterion', 'Review actual changes');
  writeFileSync(join(d, 'new.js'), 'intended new source\n');
  const refused = chalk(d, 'review', id);
  assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /Review preflight refused.*missing task base/);
  assert.equal(existsSync(counter), false); assert.equal(JSON.parse(readFileSync(tasks))[0].reviews.length, 0);
  const recovered = chalk(d, 'review', id, '--base', 'HEAD');
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  assert.equal(readFileSync(counter, 'utf8'), 'call\n');
  assert.match(recovered.stdout, /Execution directory:.*repo/); assert.match(recovered.stdout, /Task base:/);
  const seen = readFileSync(prompt, 'utf8'); assert.match(seen, /intended new source/); assert.doesNotMatch(seen, /unrelated = 1/);
  const task = JSON.parse(readFileSync(tasks))[0], review = task.reviews.at(-1);
  assert.deepEqual(review.inputs.files, ['.chalk/spec.md', 'AGENTS.md', 'CLAUDE.md', 'new.js']);
  assert.equal(review.inputs.base, task.reviewBase.commit); assert.match(review.inputs.fingerprint, /^[a-f0-9]{64}$/);
  const store = new Store(d); assert.equal(currentReview(store, store.task(id)), true);
  store.upsertTask({ ...store.task(id), reviewBase: pinReviewBase(d, 'HEAD^') });
  assert.equal(currentReview(store, store.task(id)), false, 'changing only the base invalidates the approval');
});

test('start pins once and preserves the task base across restart and later commits', t => {
  const { d } = fixture(t);
  chalk(d, 'init', '--name', 'fixture'); chalk(d, 'task', 'add', 'fix: pinned task');
  const tasks = join(d, '.chalk/tasks.json'), id = JSON.parse(readFileSync(tasks))[0].id;
  chalk(d, 'spec', id, '--criterion', 'x'); assert.equal(chalk(d, 'start', id).status, 0);
  const base = JSON.parse(readFileSync(tasks))[0].reviewBase.commit;
  writeFileSync(join(d, 'new.js'), 'later'); git(d, 'add', 'new.js'); git(d, 'commit', '-qm', 'later');
  assert.equal(chalk(d, 'start', id).status, 0);
  assert.equal(JSON.parse(readFileSync(tasks))[0].reviewBase.commit, base);
});

test('a task explicitly started before the first commit retains its empty-tree base', t => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-review-unborn-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  git(d, 'init', '-q', '-b', 'main'); git(d, 'config', 'user.name', 'Test'); git(d, 'config', 'user.email', 'test@example.invalid');
  const task = { reviewBase: pinReviewBase(d) }; assert.equal(task.reviewBase.commit, null);
  writeFileSync(join(d, 'first.js'), 'first task');
  const before = captureReviewInputs(d, task); assert.match(before.diff, /first task/);
  git(d, 'add', 'first.js'); git(d, 'commit', '-qm', 'first task');
  const after = captureReviewInputs(d, task); assert.equal(after.base, before.base); assert.match(after.diff, /first task/);
});

test('branch records the actual worktree starting commit', t => {
  const { d } = fixture(t), head = git(d, 'rev-parse', 'HEAD');
  chalk(d, 'init', '--name', 'fixture'); chalk(d, 'task', 'add', 'fix: branch baseline');
  const tasks = join(d, '.chalk/tasks.json'), id = JSON.parse(readFileSync(tasks))[0].id;
  chalk(d, 'spec', id, '--criterion', 'x');
  const result = chalk(d, 'branch', id); assert.equal(result.status, 0, result.stdout + result.stderr);
  const task = JSON.parse(readFileSync(tasks))[0];
  assert.notEqual(task.worktree, d); assert.equal(task.reviewBase.commit, head);
  assert.equal(git(task.worktree, 'rev-parse', 'HEAD'), head);
});

test('run pins the base before the executor observes task context', t => {
  const { d, top } = fixture(t), head = git(d, 'rev-parse', 'HEAD');
  chalk(d, 'init', '--name', 'fixture'); chalk(d, 'task', 'add', 'chore: execution baseline');
  const tasks = join(d, '.chalk/tasks.json'), id = JSON.parse(readFileSync(tasks))[0].id;
  chalk(d, 'spec', id, '--criterion', 'x');
  const seen = join(top, 'executor-base');
  writeFileSync(join(d, 'executor.cjs'), `const fs=require('fs');const task=JSON.parse(fs.readFileSync('.chalk/tasks.json'))[0];fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify(task.reviewBase));`);
  const cfg = join(d, '.chalk/chalk.json'), config = JSON.parse(readFileSync(cfg));
  config.protocol.executor = { command: 'node executor.cjs' }; config.protocol.review = { requiredAt: [] };
  config.protocol.requireTest = false; config.protocol.verify = { test: 'node -e "process.exit(0)"' };
  writeFileSync(cfg, JSON.stringify(config));
  const result = chalk(d, 'run', '--max', '1'); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(readFileSync(seen)).commit, head);
});

for (const flag of ['assume-unchanged', 'skip-worktree']) test(`review refuses ${flag} hiding a modified tracked file`, t => {
  const { d, task } = fixture(t);
  git(d, 'update-index', `--${flag}`, 'old.js');
  writeFileSync(join(d, 'old.js'), 'hidden modification\n');
  writeFileSync(join(d, 'visible.js'), 'visible modification\n');
  assert.throws(() => captureReviewInputs(d, task), /index flags can hide changes.*old\.js/);
  git(d, 'update-index', `--no-${flag}`, 'old.js');
  const recovered = captureReviewInputs(d, task);
  assert.deepEqual(recovered.files, ['old.js', 'visible.js']); assert.match(recovered.diff, /hidden modification/);
});

function reviewingFixture(t) {
  const f = fixture(t), { d, top } = f;
  chalk(d, 'init', '--name', 'fixture'); chalk(d, 'task', 'add', 'fix: review admission');
  const store = new Store(d), task = store.tasks()[0]; chalk(d, 'spec', task.id, '--criterion', 'Review the real candidate');
  const counter = join(top, 'calls'), runner = join(top, 'reviewer.cjs');
  writeFileSync(runner, `require('fs').appendFileSync(${JSON.stringify(counter)}, 'call\\n');console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  const meta = store.meta(); meta.protocol.review = { command: `node ${runner}`, requiredAt: ['per-task'] }; store.saveMeta(meta);
  return { ...f, store, id: task.id, counter };
}

test('a legacy CLI review persists its resolved base across later base-branch movement', t => {
  const { d, store, id, counter } = reviewingFixture(t), base = git(d, 'rev-parse', 'HEAD');
  git(d, 'checkout', '-qb', 'feature'); writeFileSync(join(d, 'feature.js'), 'task work');
  git(d, 'add', 'feature.js'); git(d, 'commit', '-qm', 'task work');
  const result = chalk(d, 'review', id); assert.equal(result.status, 0, result.stdout + result.stderr);
  const task = store.task(id); assert.equal(task.reviewBase.commit, base); assert.equal(task.reviews.at(-1).inputs.base, base);
  git(d, 'update-ref', 'refs/heads/main', 'HEAD');
  assert.equal(captureReviewInputs(d, store.task(id), store.protocol()).base, base);
  assert.equal(currentReview(store, store.task(id)), true, 'moving the branch ref does not change the pinned candidate');
  assert.equal(readFileSync(counter, 'utf8'), 'call\n');
});

test('conflicting staged and working versions refuse invocation and close an earlier approval', t => {
  const { d, store, id, counter } = reviewingFixture(t);
  assert.equal(chalk(d, 'start', id).status, 0);
  writeFileSync(join(d, 'feature.js'), 'task work');
  const passed = chalk(d, 'review', id); assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  const original = readFileSync(join(d, 'old.js'));
  writeFileSync(join(d, 'old.js'), 'staged implementation'); git(d, 'add', 'old.js');
  writeFileSync(join(d, 'old.js'), original);
  assert.equal(currentReview(store, store.task(id)), false, 'an unchanged working file cannot hide a new staged candidate');
  const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /staged and working versions conflict/);
  assert.equal(readFileSync(counter, 'utf8'), 'call\n'); assert.equal(store.task(id).reviews.length, 1);
  git(d, 'add', 'old.js');
  const renewed = chalk(d, 'review', id); assert.equal(renewed.status, 0, renewed.stdout + renewed.stderr);
  assert.equal(currentReview(store, store.task(id)), true, 'a fresh review succeeds after the index is reconciled');
});

test('submodule candidates are refused before invocation, including nested untracked changes', t => {
  const { d, top, store, id, counter } = reviewingFixture(t);
  const child = join(top, 'child'); mkdirSync(child);
  git(child, 'init', '-q', '-b', 'main'); git(child, 'config', 'user.name', 'Test'); git(child, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(child, 'tracked.js'), 'original'); git(child, 'add', 'tracked.js'); git(child, 'commit', '-qm', 'child baseline');
  git(d, '-c', 'protocol.file.allow=always', 'submodule', 'add', child, 'vendor'); git(d, 'commit', '-qm', 'add submodule');
  assert.equal(chalk(d, 'start', id).status, 0);
  for (const content of ['first nested change', 'different nested change']) {
    writeFileSync(join(d, 'vendor/new.js'), content);
    assert.throws(() => captureReviewInputs(d, store.task(id), store.protocol()), /submodule review inputs are unsupported.*vendor/);
    const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /submodule review inputs are unsupported/);
  }
  assert.equal(existsSync(counter), false); assert.equal(store.task(id).reviews.length, 0);
  git(d, 'rm', '-rf', 'vendor');
  assert.throws(() => captureReviewInputs(d, store.task(id), store.protocol()), /submodule review inputs are unsupported/);
});

test('committing or staging identical reviewed bytes preserves approval', t => {
  const { d, store, id } = reviewingFixture(t);
  assert.equal(chalk(d, 'start', id).status, 0); writeFileSync(join(d, 'feature.js'), 'same candidate\n');
  const result = chalk(d, 'review', id); assert.equal(result.status, 0, result.stdout + result.stderr);
  git(d, 'add', 'feature.js'); assert.equal(currentReview(store, store.task(id)), true);
  git(d, 'commit', '-qm', 'same reviewed candidate'); assert.equal(currentReview(store, store.task(id)), true);
});

test('a subdirectory project uses execution-relative paths and excludes its own spine', t => {
  const { d } = fixture(t), app = join(d, 'app'); mkdirSync(app);
  writeFileSync(join(app, 'code.js'), 'before'); git(d, 'add', 'app/code.js'); git(d, 'commit', '-qm', 'app baseline');
  const task = { reviewBase: pinReviewBase(app) };
  mkdirSync(join(app, '.chalk')); writeFileSync(join(app, '.chalk/tasks.json'), 'queue metadata');
  writeFileSync(join(app, 'code.js'), 'after'); writeFileSync(join(app, 'new.js'), 'new code');
  const candidate = captureReviewInputs(app, task);
  assert.deepEqual(candidate.files, ['code.js', 'new.js']); assert.match(candidate.diff, /\+after/);
  assert.doesNotMatch(candidate.diff, /queue metadata|app\/code\.js/);
  writeFileSync(join(app, 'code.js'), 'another implementation');
  assert.notEqual(captureReviewInputs(app, task).contentFingerprint, candidate.contentFingerprint);
});

test('branch/tag collisions refuse explicit and legacy review before invocation', t => {
  const { d, store, id, counter } = reviewingFixture(t), base = git(d, 'rev-parse', 'HEAD');
  git(d, 'branch', 'release-base'); git(d, 'checkout', '-qb', 'feature');
  writeFileSync(join(d, 'code.js'), 'committed task work'); git(d, 'add', 'code.js'); git(d, 'commit', '-qm', 'task change');
  git(d, 'tag', 'release-base'); git(d, 'config', 'core.warnAmbiguousRefs', 'false');
  assert.throws(() => pinReviewBase(d, 'release-base'), /ambiguous review base ref/);
  const explicit = chalk(d, 'review', id, '--base', 'release-base');
  assert.notEqual(explicit.status, 0); assert.match(explicit.stdout + explicit.stderr, /ambiguous review base ref/);
  const meta = store.meta(); meta.protocol.github.base = 'release-base'; store.saveMeta(meta);
  const legacy = chalk(d, 'review', id); assert.notEqual(legacy.status, 0); assert.match(legacy.stdout + legacy.stderr, /ambiguous review base ref/);
  assert.equal(existsSync(counter), false); assert.equal(store.task(id).reviews.length, 0);
  const selected = pinReviewBase(d, 'refs/heads/release-base'); assert.equal(selected.commit, base);
  const candidate = captureReviewInputs(d, { ...store.task(id), reviewBase: selected }, store.protocol());
  assert.match(candidate.diff, /committed task work/);
});

test('excluded-spine conflicts refuse review globally without invoking the reviewer', t => {
  const { d, store, id, counter } = reviewingFixture(t), decision = join(d, '.chalk/decisions.md');
  writeFileSync(decision, 'baseline\n'); git(d, 'add', '.chalk/decisions.md'); git(d, 'commit', '-qm', 'decision baseline');
  assert.equal(chalk(d, 'start', id).status, 0);
  git(d, 'checkout', '-qb', 'other'); writeFileSync(decision, 'other\n'); git(d, 'commit', '-qam', 'other decision');
  git(d, 'checkout', 'main'); writeFileSync(decision, 'main\n'); git(d, 'commit', '-qam', 'main decision');
  assert.notEqual(call(d, 'git', ['merge', 'other']).status, 0);
  writeFileSync(join(d, 'feature.js'), 'real task change');
  const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /unresolved merge conflicts/);
  assert.equal(existsSync(counter), false); assert.equal(store.task(id).reviews.length, 0);
  const nested = join(d, 'nested'); mkdirSync(nested); writeFileSync(join(nested, 'code.js'), 'nested work');
  assert.throws(() => captureReviewInputs(nested, store.task(id), store.protocol()), /unresolved merge conflicts/, 'a subdirectory review cannot hide conflicts elsewhere in the index');
});

test('replacement refs cannot reinterpret a pinned base or approved candidate', t => {
  const { d, store, id } = reviewingFixture(t);
  assert.equal(chalk(d, 'start', id).status, 0);
  writeFileSync(join(d, 'feature.js'), 'task work\n');
  const passed = chalk(d, 'review', id); assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  const task = store.task(id), before = captureReviewInputs(d, task, store.protocol());
  // Replacing the base with an empty-tree commit would turn old.js into a task
  // addition if any baseline resolution or diff command honored replacement refs.
  const empty = git(d, 'hash-object', '-w', '-t', 'tree', '--stdin');
  const replacement = git(d, 'commit-tree', empty, '-m', 'replacement baseline');
  git(d, 'replace', task.reviewBase.commit, replacement);
  const after = captureReviewInputs(d, task, store.protocol());
  assert.equal(after.base, before.base); assert.equal(after.diff, before.diff);
  assert.deepEqual(after.files, before.files); assert.equal(after.contentFingerprint, before.contentFingerprint);
  assert.equal(currentReview(store, store.task(id)), true, 'replacement refs are ignored consistently, so the approved candidate is unchanged');
});

test('clean filters cannot erase working source from review or retain earlier approval', t => {
  const { d, top, store, id, counter } = reviewingFixture(t);
  const attrs = join(d, '.git/info/attributes'), filter = join(top, 'clean.cjs');
  writeFileSync(filter, 'process.stdout.write(require("fs").readFileSync(0,"utf8").replace(/^hidden.*\\n/gm,""));');
  git(d, 'config', 'filter.erase.clean', `node ${filter}`);
  assert.equal(chalk(d, 'start', id).status, 0); writeFileSync(join(d, 'feature.js'), 'task work\n');
  const passed = chalk(d, 'review', id); assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  writeFileSync(attrs, 'old.js filter=erase\n');
  assert.equal(currentReview(store, store.task(id)), false, 'new transformation policy closes the earlier approval');
  writeFileSync(join(d, 'old.js'), 'hiddenRuntimeBehavior();\n' + readFileSync(join(d, 'old.js'), 'utf8'));
  git(d, 'add', 'old.js');
  assert.equal(git(d, 'diff', '--name-only', 'HEAD', '--', 'old.js'), '', 'fixture demonstrates Git hiding the effective source change');
  const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /Git content transformation filter.*old\.js/);
  assert.equal(readFileSync(counter, 'utf8'), 'call\n'); assert.equal(store.task(id).reviews.length, 1);
});

test('conversion-dependent inputs are refused while ordinary LF text attributes remain supported', t => {
  const { d } = fixture(t), task = { reviewBase: pinReviewBase(d) }, attrs = join(d, '.git/info/attributes');
  writeFileSync(join(d, 'new.js'), 'task work\n');
  writeFileSync(attrs, '*.js text=auto\n');
  assert.deepEqual(captureReviewInputs(d, task).files, ['new.js']);
  writeFileSync(join(d, 'new.js'), 'task work\r\n');
  assert.throws(() => captureReviewInputs(d, task), /line-ending normalization/);
  writeFileSync(join(d, 'new.js'), 'task work\n');
  for (const attr of ['working-tree-encoding=UTF-8', 'ident', 'filter=']) {
    writeFileSync(attrs, `*.js ${attr}\n`);
    assert.throws(() => captureReviewInputs(d, task), /Git content transformation/);
  }
});

test('archived spine alone never invokes review and mixed changes retain only source', t => {
  const { d, store, id, counter } = reviewingFixture(t);
  git(d, 'add', '.chalk/spec.md', 'AGENTS.md', 'CLAUDE.md'); git(d, 'commit', '-qm', 'project contract baseline');
  assert.equal(chalk(d, 'start', id).status, 0);
  mkdirSync(join(d, '.chalk/archive')); writeFileSync(join(d, '.chalk/archive/tasks-2025.json'), '[]\n');
  assert.deepEqual(captureReviewInputs(d, store.task(id), store.protocol()).files, []);
  const empty = chalk(d, 'review', id); assert.notEqual(empty.status, 0);
  assert.equal(existsSync(counter), false); assert.equal(store.task(id).reviews.length, 0);
  git(d, 'add', '.chalk/archive/tasks-2025.json'); git(d, 'commit', '-qm', 'archive bookkeeping');
  writeFileSync(join(d, '.chalk/archive/tasks-2025.json'), '[ ]\n');
  writeFileSync(join(d, 'feature.js'), 'real task work\n');
  const mixed = chalk(d, 'review', id); assert.equal(mixed.status, 0, mixed.stdout + mixed.stderr);
  assert.deepEqual(store.task(id).reviews.at(-1).inputs.files, ['feature.js']);
  assert.equal(readFileSync(counter, 'utf8'), 'call\n');
});

test('custom regression aliases exclude canonical content before review capture', t => {
  const { d, store, id, counter } = reviewingFixture(t);
  git(d, 'add', '.chalk/spec.md', 'AGENTS.md', 'CLAUDE.md'); git(d, 'commit', '-qm', 'project contract baseline');
  assert.equal(chalk(d, 'start', id).status, 0);
  mkdirSync(join(d, 'private-regressions')); writeFileSync(join(d, 'private-regressions/empty.test.mjs'), '');
  symlinkSync('../private-regressions', join(d, '.chalk/regression-alias'));
  const meta = store.meta(); meta.protocol.regression = { dir: '.chalk/regression-alias' }; store.saveMeta(meta);
  const empty = captureReviewInputs(d, store.task(id), store.protocol()); assert.deepEqual(empty.files, []); assert.equal(empty.diff, '');
  const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.equal(existsSync(counter), false);
  git(d, 'add', 'private-regressions/empty.test.mjs'); git(d, 'commit', '-qm', 'protected placeholder');
  writeFileSync(join(d, 'feature.js'), 'visible task work\n');
  const mixed = captureReviewInputs(d, store.task(id), store.protocol());
  assert.deepEqual(mixed.files, ['feature.js']); assert.doesNotMatch(mixed.diff, /private-regressions|regression-alias/);
  assert.throws(() => captureReviewInputs(d, store.task(id), { regression: { dir: '.' } }), /protected regression directory covers/);
});

test('symlinked tracked input parents are refused before Git diff reads their targets', t => {
  const { d, task } = fixture(t);
  mkdirSync(join(d, 'src')); writeFileSync(join(d, 'src/code.js'), 'original\n'); git(d, 'add', 'src/code.js'); git(d, 'commit', '-qm', 'source directory');
  rmSync(join(d, 'src'), { recursive: true });
  mkdirSync(join(d, 'private-regressions')); writeFileSync(join(d, 'private-regressions/code.js'), '');
  symlinkSync('private-regressions', join(d, 'src'));
  assert.throws(() => captureReviewInputs(d, task, { regression: { dir: 'private-regressions' } }), /symlinked review input directory/);
});

test('executable-bit changes stay reviewable when Git normally ignores file modes', t => {
  const { d, store, id } = reviewingFixture(t);
  assert.equal(chalk(d, 'start', id).status, 0); writeFileSync(join(d, 'feature.js'), 'task work\n');
  const passed = chalk(d, 'review', id); assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  git(d, 'config', 'core.filemode', 'false'); chmodSync(join(d, 'old.js'), 0o755);
  assert.equal(git(d, 'diff', '--name-only', '--', 'old.js'), '', 'ordinary Git hides the mode-only change');
  const candidate = captureReviewInputs(d, store.task(id), store.protocol());
  assert.ok(candidate.files.includes('old.js')); assert.match(candidate.diff, /old mode 100644\nnew mode 100755/);
  assert.equal(currentReview(store, store.task(id)), false, 'an executable-bit change closes the earlier approval');
});

test('branch reuse pins the actual checkout even after the configured base advances', t => {
  const { d, store, id } = reviewingFixture(t), original = git(d, 'rev-parse', 'HEAD');
  git(d, 'branch', 'fix/reused');
  writeFileSync(join(d, 'main-only.js'), 'later main work\n'); git(d, 'add', 'main-only.js'); git(d, 'commit', '-qm', 'advance main');
  store.upsertTask({ ...store.task(id), branch: 'fix/reused' });
  const result = chalk(d, 'branch', id); assert.equal(result.status, 0, result.stdout + result.stderr);
  const task = store.task(id); assert.equal(git(task.worktree, 'rev-parse', 'HEAD'), original);
  assert.equal(task.reviewBase.commit, original, 'the requested main start point was not the reused branch starting revision');
  writeFileSync(join(task.worktree, 'new-work.js'), 'new task work\n');
  assert.deepEqual(captureReviewInputs(task.worktree, task, store.protocol()).files, ['new-work.js']);
});

for (const alias of [false, true]) test(`literal POSIX backslashes in protected paths remain excluded (alias=${alias})`, { skip: process.platform === 'win32' }, t => {
  const { d, store, id, counter } = reviewingFixture(t);
  git(d, 'add', '.chalk/spec.md', 'AGENTS.md', 'CLAUDE.md'); git(d, 'commit', '-qm', 'project contract baseline');
  assert.equal(chalk(d, 'start', id).status, 0);
  const protectedDir = 'private\\regressions';
  mkdirSync(join(d, protectedDir)); writeFileSync(join(d, protectedDir, 'empty.test.mjs'), '');
  if (alias) symlinkSync(`../${protectedDir}`, join(d, '.chalk/regression-alias'));
  const meta = store.meta(); meta.protocol.regression = { dir: alias ? '.chalk/regression-alias' : protectedDir }; store.saveMeta(meta);
  const empty = captureReviewInputs(d, store.task(id), store.protocol());
  assert.deepEqual(empty.files, []); assert.equal(empty.diff, '');
  const refused = chalk(d, 'review', id); assert.notEqual(refused.status, 0); assert.equal(existsSync(counter), false);
  writeFileSync(join(d, 'feature.js'), 'visible work\n');
  const mixed = captureReviewInputs(d, store.task(id), store.protocol());
  assert.deepEqual(mixed.files, ['feature.js']); assert.doesNotMatch(mixed.diff, /empty\.test\.mjs|private|regression-alias/);
});
