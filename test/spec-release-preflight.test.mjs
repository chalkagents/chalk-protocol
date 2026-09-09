import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
const CLI = resolve('bin/chalk.mjs');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const ok = (cwd, ...args) => { const r = run(cwd, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

for (const commit of [false, true]) {
  test(`tag-collision preflight does not pin an artifact-free release attempt (commit=${commit})`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-release-preflight-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true })); ok(root, 'init', '--bare');
    fs.writeFileSync(join(root, 'check.cjs'), 'console.log("checked");'); fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    store.upsertTask({ id: 'task-first', title: 'first', state: 'done', acceptanceCriteria: [{ text: 'first contract' }], tests: [] });
    git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test'); git(root, 'add', '-A'); git(root, 'commit', '-m', 'initial'); git(root, 'tag', 'v1.1.0');
    const args = ['release', '--version', '1.1.0', ...(commit ? ['--commit'] : [])], head = git(root, 'rev-parse', 'HEAD');
    const refused = run(root, ...args); assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /tag v1.1.0 already exists/);
    assert.equal(fs.existsSync(join(root, '.chalk/local/releases')), false);
    assert.equal(fs.existsSync(join(root, 'CHANGELOG.md')), false); assert.equal(JSON.parse(fs.readFileSync(join(root, 'package.json'))).version, '1.0.0'); assert.equal(git(root, 'rev-parse', 'HEAD'), head);
    store.upsertTask({ id: 'task-later', title: 'later', state: 'specd', acceptanceCriteria: [{ text: 'later contract' }], tests: [] }); ok(root, 'start', 'task-later'); ok(root, 'done', 'task-later');
    ok(root, ...args, '--no-tag'); assert.equal(store.task('task-first').released, '1.1.0'); assert.equal(store.task('task-later').released, '1.1.0');
    assert.equal(git(root, 'rev-parse', 'v1.1.0'), head, 'retry does not replace the colliding tag');
    assert.equal(JSON.parse(fs.readFileSync(join(root, 'package.json'))).version, '1.1.0');
  });
}
