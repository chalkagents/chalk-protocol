import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

const CLI = resolve('bin/chalk.mjs');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'chalk-source-metadata-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [CLI, 'init', '--name', 'source'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), 'console.log("ok");');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function repo(root) {
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
}

test('permission-only changes invalidate a verification run when executable bits are supported', t => {
  const { root, store } = fixture(t), script = join(root, 'script.sh');
  writeFileSync(script, '#!/bin/sh\nexit 0\n'); chmodSync(script, 0o755);
  const executable = statSync(script).mode & 0o111;
  writeFileSync(join(root, 'check.cjs'), 'require("fs").chmodSync("script.sh",0o644);');
  const before = readFileSync(script), result = verify(store);
  assert.deepEqual(readFileSync(script), before, 'only permissions changed');
  assert.equal(result.toolchainGreen, true);
  if (executable !== (statSync(script).mode & 0o111)) {
    assert.equal(result.freshness, 'stale');
    assert.equal(result.green, false);
  } else {
    // Windows does not expose POSIX executable bits; unchanged metadata remains fresh there.
    assert.equal(process.platform, 'win32');
    assert.equal(result.freshness, 'fresh');
  }
});

test('populated submodules verify green and dirty tracked/untracked inputs invalidate evidence', t => {
  const { root, store } = fixture(t);
  const upstream = mkdtempSync(join(tmpdir(), 'chalk-source-upstream-'));
  t.after(() => rmSync(upstream, { recursive: true, force: true }));
  repo(upstream); writeFileSync(join(upstream, 'source.js'), 'aaaa');
  git(upstream, 'add', 'source.js'); git(upstream, 'commit', '-qm', 'fixture');
  repo(root); git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'module');
  const clean = sourceIdentity(root);
  assert.equal(clean.status, 'known', clean.error);
  assert.equal(verify(store).green, true);
  writeFileSync(join(root, 'module/source.js'), 'bbbb');
  const dirty = sourceIdentity(root);
  assert.equal(dirty.status, 'known', dirty.error);
  assert.notEqual(dirty.digest, clean.digest);
  writeFileSync(join(root, 'module/new.js'), 'new source');
  assert.notEqual(sourceIdentity(root).digest, dirty.digest);
  writeFileSync(join(root, 'check.cjs'), 'require("fs").writeFileSync("module/source.js","cccc");');
  const changedDuringRun = verify(store);
  assert.equal(changedDuringRun.toolchainGreen, true);
  assert.equal(changedDuringRun.freshness, 'stale');
  assert.equal(changedDuringRun.green, false);
});

test('uninitialized submodule identity retains the gitlink and supports later initialization', t => {
  const { root, store } = fixture(t);
  const upstream = mkdtempSync(join(tmpdir(), 'chalk-source-upstream-'));
  t.after(() => rmSync(upstream, { recursive: true, force: true }));
  repo(upstream); writeFileSync(join(upstream, 'source.js'), 'a');
  git(upstream, 'add', 'source.js'); git(upstream, 'commit', '-qm', 'first');
  const first = git(upstream, 'rev-parse', 'HEAD');
  writeFileSync(join(upstream, 'source.js'), 'b');
  git(upstream, 'commit', '-qam', 'second');
  const second = git(upstream, 'rev-parse', 'HEAD');
  repo(root); git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'module');
  git(root, 'submodule', 'deinit', '-f', 'module');
  const before = sourceIdentity(root);
  assert.equal(before.status, 'known', before.error);
  assert.equal(verify(store).green, true);
  git(root, 'update-index', '--cacheinfo', `160000,${first},module`);
  assert.notEqual(sourceIdentity(root).digest, before.digest, 'gitlink change with no checked-out source is visible');
  git(root, 'update-index', '--cacheinfo', `160000,${second},module`);
  git(root, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', 'module');
  assert.equal(sourceIdentity(root).status, 'known');
  assert.notEqual(sourceIdentity(root).digest, before.digest);
  assert.equal(verify(store).green, true);
});
