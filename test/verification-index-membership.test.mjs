import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t, code) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-index-membership-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), code);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { root, store };
}

test('temporary tracking cannot hide modifications to an otherwise ignored input', t => {
  const { root, store } = fixture(t, 'const fs=require("fs"),{execFileSync:git}=require("child_process");git("git",["add","-f","candidate.js"]);git("git",["ls-files","--error-unmatch","candidate.js"]);fs.writeFileSync("candidate.js","changed while tracked");console.log(fs.readFileSync("candidate.js","utf8"));git("git",["rm","--cached","-f","candidate.js"]);');
  writeFileSync(join(root, '.gitignore'), '/candidate.js\n.chalk/local/\n');
  writeFileSync(join(root, 'candidate.js'), 'ignored initially');
  const result = verify(store), command = result.toolchain.find(g => g.gate === 'test');
  assert.equal(result.toolchainGreen, true); assert.equal(result.green, false);
  assert.equal(result.freshness, 'stale');
  assert.ok(command.inputChanges.some(p => p.startsWith('git-membership:')));
  assert.match(readFileSync(command.stdoutPath, 'utf8'), /changed while tracked/);
  const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  assert.equal(receipt.before.source.digest, receipt.after.source.digest, 'final source manifest alone would miss the transition');
});

test('staging unchanged ordinary inputs between runs preserves green verification and source identity', t => {
  const { root, store } = fixture(t, 'console.log("checked")');
  const first = verify(store);
  assert.equal(first.green, true, JSON.stringify(first));
  execFileSync('git', ['add', 'check.cjs'], { cwd: root });
  const second = verify(store);
  assert.equal(second.green, true, JSON.stringify(second));
  const a = JSON.parse(readFileSync(first.evidence.path, 'utf8'));
  const b = JSON.parse(readFileSync(second.evidence.path, 'utf8'));
  assert.equal(a.after.source.digest, b.before.source.digest);
});

test('shared indexes verify unchanged and reject writes during command execution', t => {
  const { root, store } = fixture(t, 'console.log("checked")');
  execFileSync('git', ['add', 'check.cjs'], { cwd: root });
  execFileSync('git', ['update-index', '--split-index'], { cwd: root });
  assert.equal(verify(store).green, true);
  const shared = resolve(root, execFileSync('git', ['rev-parse', '--shared-index-path'], { cwd: root, encoding: 'utf8' }).trim());
  writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),p=${JSON.stringify(shared)};fs.writeFileSync(p,fs.readFileSync(p));`);
  const result = verify(store);
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  assert.ok(result.toolchain.find(g => g.gate === 'test').inputChanges.includes(`git-membership:${shared}`));
});
