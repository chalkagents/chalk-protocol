import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const run = (cwd, args, env = process.env) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...env, NO_COLOR: '1' } });
const ok = (cwd, ...args) => { const r = run(cwd, args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
function fixture(t, mode, failTag = false) {
  const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-spec-release-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'main'), bare = join(parent, 'remote'), shim = join(parent, 'shim');
  for (const dir of [root, bare, shim]) fs.mkdirSync(dir);
  ok(root, 'init', '--bare');
  const store = new Store(root), id = 'task-release';
  store.upsertTask({ id, title: 'feat: released behavior', branchType: 'feat', state: 'done', doneAt: '2020-01-01T00:00:00Z', acceptanceCriteria: [{ text: 'original contract' }], tests: [] });
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  const probe = join(parent, 'probe.mjs'), attempt = join(parent, 'attempt.mjs'), entered = join(parent, 'entered'), probes = join(parent, 'probes');
  fs.writeFileSync(attempt, `import fs from 'node:fs';import {Store} from ${JSON.stringify(STORE)};const lock=Store.prototype.withLock;Store.prototype.withLock=function(fn,opts){fs.writeFileSync(${JSON.stringify(entered)},'entered');return lock.call(this,fn,opts);};process.argv=${JSON.stringify([process.execPath, CLI, 'amend-spec', id, '--replace', 'ac-1', '--criterion', 'concurrent contract', '--why', 'arrives at release side effect'])};await import(${JSON.stringify(new URL('../bin/chalk.mjs', import.meta.url).href)});`);
  fs.writeFileSync(probe, `import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {retireLockGeneration} from ${JSON.stringify(STORE)};const lock=${JSON.stringify(join(root, '.chalk/.lock'))};const token=fs.readFileSync(lock+'/owner','utf8').split(' ')[0];const old=new Date(Date.now()-60000);fs.utimesSync(lock,old,old);assert.equal(retireLockGeneration(lock,token,{requireStale:true}),false);fs.rmSync(${JSON.stringify(entered)},{force:true});const r=spawnSync(${JSON.stringify(process.execPath)},[${JSON.stringify(attempt)}],{cwd:${JSON.stringify(root)},timeout:1500,env:{...process.env,PATH:${JSON.stringify(process.env.PATH)}}});assert.equal(r.error?.code,'ETIMEDOUT');assert.ok(fs.existsSync(${JSON.stringify(entered)}));const t=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, '.chalk/tasks.json'))})).find(t=>t.id===${JSON.stringify(id)});assert.equal(t.specRevision||0,0);fs.appendFileSync(${JSON.stringify(probes)},'protected\\n');`);
  const tagAttempts = join(parent, 'tag-attempts'), realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(join(shim, 'git'), `#!/usr/bin/env node\nconst fs=require('fs'),cp=require('child_process'),a=process.argv.slice(2);if(a[0]==='tag'&&a.some(x=>x==='-a'||x==='-fa')){fs.appendFileSync(${JSON.stringify(tagAttempts)},'tag\\n');${failTag ? "process.exit(9);" : `cp.execFileSync(${JSON.stringify(process.execPath)},[${JSON.stringify(probe)}],{stdio:'inherit'});`}}const r=cp.spawnSync(${JSON.stringify(realGit)},a,{stdio:'inherit'});process.exit(r.status??1);`, { mode: 0o755 });
  const ghFile = join(root, 'gh.mjs');
  fs.writeFileSync(ghFile, `import {execFileSync} from 'node:child_process';const a=process.argv.slice(2);const g=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:'pipe'}).trim();if(a.includes('list'))console.log('[{"number":7}]');else if(a.includes('checks'))console.log('[{"bucket":"pass"}]');else if(a.includes('merge')){${failTag ? '' : `execFileSync(${JSON.stringify(process.execPath)},[${JSON.stringify(probe)}],{stdio:'inherit'});`}g('push','origin','dev:main');}`);
  const meta = store.meta(); meta.protocol.github = { command: 'node gh.mjs', base: mode === 'promote' ? 'dev' : 'main', deployBase: 'main', ciPollAttempts: 0 }; store.saveMeta(meta);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test'); git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial');
  git(bare, 'init', '--bare', '-b', 'main'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main');
  if (mode === 'promote') { git(root, 'switch', '-c', 'dev'); git(root, 'push', '-u', 'origin', 'dev'); }
  return { parent, root, bare, store, id, probes, tagAttempts, env: { ...process.env, PATH: `${shim}:${process.env.PATH}` }, args: ['release', mode === 'promote' ? '--promote' : '--commit'] };
}
for (const mode of ['local', 'promote']) {
  // https://github.com/chalkagents/chalk-protocol/issues/251 tracks Windows executable Git-shim parity.
  test(`${mode} release holds a protected amendment lock through side effects and completion`, { skip: process.platform === 'win32' }, t => {
    const f = fixture(t, mode); const r = run(f.root, f.args, f.env); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(f.store.task(f.id).released, '1.1.0'); assert.equal(fs.existsSync(join(f.root, '.chalk/.lock')), false);
    assert.equal(fs.readFileSync(f.probes, 'utf8').trim().split('\n').length, mode === 'promote' ? 2 : 1);
    assert.ok(git(mode === 'promote' ? f.bare : f.root, 'rev-parse', 'refs/tags/v1.1.0'));
    ok(f.root, 'amend-spec', f.id, '--add', 'later contract', '--why', 'after publication');
    assert.ok(f.store.task(f.id).completionInvalidated, 'a later amendment remains pending rather than being overwritten by release');
  });
  for (const legacy of [false, true]) {
    // https://github.com/chalkagents/chalk-protocol/issues/251 tracks Windows executable Git-shim parity.
    test(`${mode} recovery refuses publication after an amendment between attempts (legacy=${legacy})`, { skip: process.platform === 'win32' }, t => {
      const f = fixture(t, mode, true);
      const first = run(f.root, f.args, f.env); assert.notEqual(first.status, 0); assert.match(first.stdout + first.stderr, /git tag.*failed/);
      assert.equal(fs.existsSync(join(f.root, '.chalk/.lock')), false, 'failed release releases its lease');
      assert.equal(f.store.task(f.id).released, undefined);
      const head = git(f.root, 'rev-parse', 'HEAD'), tags = fs.readFileSync(f.tagAttempts, 'utf8');
      if (legacy) fs.rmSync(join(f.root, '.chalk/local/releases'), { recursive: true });
      ok(f.root, 'amend-spec', f.id, '--replace', 'ac-1', '--criterion', 'amended between attempts', '--why', 'new contract before resume');
      // An unrelated completed task makes recovery reachable; it must not allow
      // publication of the interrupted candidate containing the amended task.
      f.store.upsertTask({ id: 'task-later', title: 'later completion', state: 'done', doneAt: new Date().toISOString(), acceptanceCriteria: [{ text: 'other' }], tests: [] });
      const resumed = run(f.root, f.args, f.env); assert.notEqual(resumed.status, 0); assert.match(resumed.stdout + resumed.stderr, /cannot resume/);
      assert.equal(fs.readFileSync(f.tagAttempts, 'utf8'), tags, 'retry must fail before attempting another tag');
      assert.equal(git(f.root, 'rev-parse', 'HEAD'), head, 'retry does not create another release commit');
      assert.equal(f.store.task(f.id).released, undefined); assert.equal(f.store.task('task-later').released, undefined);
      assert.equal(fs.existsSync(join(f.root, '.chalk/.lock')), false);
      assert.equal(git(f.bare, 'tag', '--list'), '');
    });
  }
}
