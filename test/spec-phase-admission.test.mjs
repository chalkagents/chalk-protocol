import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
const CLI = resolve('bin/chalk.mjs'), STORE = new URL('../lib/store.mjs', import.meta.url).href;
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };

for (const gate of ['audit', 'review']) {
  test(`phase ${gate} admission holds amendment exclusion through phase persistence and releases on refusal`, t => {
    const parent = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-phase-admission-')));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'project'); fs.mkdirSync(root); ok(root, 'init', '--bare');
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");');
    const store = new Store(root), id = 'task-phase', meta = store.meta();
    meta.protocol.verify = { test: { cmd: 'node check.cjs', when: 'phase' } };
    meta.protocol.regression = { required: gate === 'audit', command: '', tests: [], locPerTest: 1e9 };
    meta.protocol.review = { requiredAt: gate === 'review' ? ['phase-advance'] : [] }; store.saveMeta(meta);
    store.upsertTask({ id, title: 'phase contract', state: 'in-progress', startedAt: new Date().toISOString(), acceptanceCriteria: [{ text: 'initial' }], tests: [], reviews: [] });
    if (gate === 'audit') ok(root, 'audit'); else ok(root, 'review', id, '--note', 'fixture approval');
    const reached = join(parent, 'reached'), result = join(parent, 'result'), amendment = join(parent, 'amend.mjs'), hook = join(parent, 'hook.mjs');
    fs.writeFileSync(amendment, `import fs from 'node:fs';import {Store} from ${JSON.stringify(STORE)};const lock=Store.prototype.withLock;Store.prototype.withLock=function(...args){fs.writeFileSync(${JSON.stringify(reached)},'reached');return lock.apply(this,args)};process.argv=${JSON.stringify([process.execPath, CLI, 'amend-spec', id, '--add', 'during phase admission', '--why', 'concurrent change'])};await import(${JSON.stringify(pathToFileURL(CLI).href)});`);
    fs.writeFileSync(hook, `import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {Store} from ${JSON.stringify(STORE)};const set=Store.prototype.setPhase;Store.prototype.setPhase=function(phase){const r=spawnSync(process.execPath,[${JSON.stringify(amendment)}],{cwd:this.root,encoding:'utf8',timeout:2000});fs.writeFileSync(${JSON.stringify(result)},JSON.stringify({status:r.status,error:r.error?.code,output:r.stdout+r.stderr}));return set.call(this,phase)};`);
    const phase = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, CLI, 'phase', 'delivery'], { cwd: root, encoding: 'utf8' });
    assert.equal(phase.status, 0, phase.stdout + phase.stderr);
    assert.equal(fs.readFileSync(reached, 'utf8'), 'reached');
    const attempt = JSON.parse(fs.readFileSync(result)); assert.equal(attempt.error, 'ETIMEDOUT', attempt.output);
    assert.equal(store.task(id).specRevision || 0, 0); assert.equal(store.phase(), 'delivery');
    ok(root, 'amend-spec', id, '--add', 'after phase admission', '--why', 'new contract');
    const denied = run(root, 'phase', 'maintenance'); assert.notEqual(denied.status, 0);
    assert.match(denied.stdout + denied.stderr, gate === 'audit' ? /GATE P7/ : /GATE P5/);
    assert.equal(store.phase(), 'delivery'); assert.equal(fs.existsSync(join(root, '.chalk/.lock')), false, 'failed admission releases the lock');
    ok(root, 'amend-spec', id, '--add', 'after refused phase', '--why', 'lock remains available');
  });
}
