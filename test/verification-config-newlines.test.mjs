import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-config-newlines-'))), root = join(base, 'project');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(root); execFileSync('git', ['init', '-q'], { cwd: root });
  return { base, root };
}

for (const exists of [false, true]) {
  test(`a newline-containing explicit global config is bound when initially ${exists ? 'empty' : 'absent'}`, t => {
    const { base, root } = fixture(t), policy = join(base, 'global\nconfig'), rules = join(base, 'ignore.rules');
    let supported = true;
    try { writeFileSync(policy, ''); }
    catch (error) {
      // Some Windows filesystems reject control characters. Verify their rejection
      // path instead of pretending that an impossible filename was exercised.
      if (process.platform !== 'win32' || !['EINVAL', 'ENOENT', 'ENOTSUP'].includes(error.code)) throw error;
      supported = false;
    }
    if (supported && !exists) rmSync(policy);
    writeFileSync(rules, '/ephemeral.js\n');
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    const config = `[core]\nexcludesFile = ${JSON.stringify(rules.replaceAll('\\', '/'))}\n`;
    writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),{execFileSync:git}=require("child_process"),p=${JSON.stringify(policy)};fs.writeFileSync(p,${JSON.stringify(config)});fs.writeFileSync("ephemeral.js","used");git("git",["check-ignore","ephemeral.js"]);console.log(fs.readFileSync("ephemeral.js","utf8"));fs.unlinkSync("ephemeral.js");setTimeout(()=>${exists ? 'fs.writeFileSync(p,"")' : 'fs.unlinkSync(p)'},500);`);
    const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    const original = process.env.GIT_CONFIG_GLOBAL;
    let result;
    try { process.env.GIT_CONFIG_GLOBAL = policy; result = verify(store); }
    finally { if (original === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = original; }
    assert.equal(result.green, false);
    const command = result.toolchain.find(g => g.gate === 'test');
    if (!supported) { assert.ok(result.freshness === 'unknown' || command?.exitCode !== 0); return; }
    assert.equal(command.exitCode, 0, JSON.stringify(command));
    assert.equal(result.freshness, 'stale');
    assert.match(readFileSync(command.stdoutPath, 'utf8'), /used/);
    const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
    assert.ok(Object.hasOwn(receipt.before.source.policyInputs, policy));
    assert.ok(command.inputChanges.includes(`git-policy:${policy}`));
  });
}

test('ambiguous default global configuration discovery fails closed', t => {
  const { base, root } = fixture(t), previousGlobal = process.env.GIT_CONFIG_GLOBAL, previousXdg = process.env.XDG_CONFIG_HOME;
  try {
    delete process.env.GIT_CONFIG_GLOBAL; process.env.XDG_CONFIG_HOME = join(base, 'config\nroot');
    assert.equal(sourceIdentity(root).status, 'unknown');
  } finally {
    if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previousGlobal;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousXdg;
  }
});
