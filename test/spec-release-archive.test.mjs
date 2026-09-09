import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { archivedTasks } from '../lib/archive.mjs';
const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
for (const amended of [false, true]) {
  test(`promotion recovery after partial release bookkeeping and archival preserves contract checks (amended=${amended})`, t => {
    const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-release-archive-')));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main'), bare = join(parent, 'remote'); fs.mkdirSync(root); fs.mkdirSync(bare);
    ok(root, 'init', '--bare');
    fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const log = join(parent, 'gh.log');
    fs.writeFileSync(join(root, 'gh.mjs'), `import fs from 'node:fs';import {execFileSync} from 'node:child_process';const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},a.join(' ')+'\\n');if(a.includes('list'))console.log('[{"number":7}]');else if(a.includes('checks'))console.log('[{"bucket":"pass"}]');else if(a.includes('merge'))execFileSync('git',['push','origin','dev:main'],{stdio:'pipe'});`);
    const store = new Store(root), meta = store.meta();
    meta.protocol.github = { command: 'node gh.mjs', base: 'dev', deployBase: 'main', ciPollAttempts: 0 };
    meta.protocol.verify = { test: 'node check.cjs' }; meta.protocol.review = { requiredAt: [] }; store.saveMeta(meta);
    for (const [id, day] of [['task-one', '01'], ['task-two', '02']]) store.upsertTask({ id, title: `feat: ${id}`, branchType: 'feat', state: 'done', doneAt: `2020-01-${day}T00:00:00Z`, acceptanceCriteria: [{ text: 'accepted contract' }], tests: [] });
    git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test'); git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial');
    git(bare, 'init', '--bare', '-b', 'main'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main'); git(root, 'switch', '-c', 'dev'); git(root, 'push', '-u', 'origin', 'dev');
    const fault = join(parent, 'interrupt.mjs');
    fs.writeFileSync(fault, `import {Store} from ${JSON.stringify(STORE)};const save=Store.prototype.upsertTask;Store.prototype.upsertTask=function(task){const result=save.call(this,task);if(task.id==='task-one'&&task.released)throw new Error('interrupt after first release marker');return result;};`);
    const first = spawnSync(process.execPath, ['--import', pathToFileURL(fault).href, CLI, 'release', '--promote'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(first.status, 0); assert.match(first.stdout + first.stderr, /interrupt after first release marker/);
    assert.equal(store.task('task-one').released, '1.1.0'); assert.equal(store.task('task-two').released, undefined);
    const tag = git(bare, 'rev-parse', 'refs/tags/v1.1.0'), head = git(root, 'rev-parse', 'HEAD');
    const publicationLog = fs.readFileSync(log, 'utf8');
    assert.equal(fs.existsSync(join(root, '.chalk/.lock')), false);
    if (amended) {
      ok(root, 'amend-spec', 'task-one', '--replace', 'ac-1', '--criterion', 'new accepted contract', '--why', 'later change');
      ok(root, 'start', 'task-one'); ok(root, 'done', 'task-one');
      // Model a later publication before archival; its accepted revision must
      // not be mistaken for the earlier interrupted candidate's revision.
      const later = store.task('task-one'); later.released = '1.2.0'; store.upsertTask(later);
    }
    ok(root, 'archive'); assert.equal(store.task('task-one'), undefined); assert.equal(archivedTasks(store).length, 1);
    const resumed = run(root, 'release', '--promote');
    if (amended) {
      assert.notEqual(resumed.status, 0); assert.match(resumed.stdout + resumed.stderr, /release specification changed/);
      assert.equal(store.task('task-two').released, undefined);
    } else {
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(store.task('task-two').released, '1.1.0');
      assert.equal(archivedTasks(store)[0].released, '1.1.0');
    }
    assert.equal(store.task('task-one'), undefined, 'recovery does not resurrect archived tasks');
    assert.equal(fs.readFileSync(log, 'utf8'), publicationLog, 'no duplicate promotion PR or merge');
    assert.equal(git(bare, 'rev-parse', 'refs/tags/v1.1.0'), tag, 'published tag stays unchanged');
    assert.equal(git(root, 'rev-parse', 'HEAD'), head, 'no duplicate release commit');
    assert.equal(fs.existsSync(join(root, '.chalk/.lock')), false);
  });
}
