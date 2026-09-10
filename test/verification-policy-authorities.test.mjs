import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t, nested = false) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-policy-authority-')));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: top });
  const root = nested ? join(top, 'app') : top;
  if (nested) mkdirSync(root);
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  return { top, root, store };
}

function assertPolicyRejection(result, path) {
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  const command = result.toolchain.find(g => g.gate === 'test');
  assert.ok(command.inputChanges.includes(`git-policy:${path}`), JSON.stringify(command));
  const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
  assert.ok(Object.hasOwn(receipt.before.source.policyInputs, path));
}

test('subdirectory verification binds ancestor ignore files through the Git root', t => {
  const { top, root, store } = fixture(t, true), policy = join(top, '.gitignore');
  writeFileSync(policy, '');
  writeFileSync(join(root, 'check.cjs'), 'const fs=require("fs"),p="../.gitignore",original=fs.readFileSync(p);fs.writeFileSync(p,"/app/ephemeral.js\\n");fs.writeFileSync("ephemeral.js","used");fs.readFileSync("ephemeral.js");fs.unlinkSync("ephemeral.js");setTimeout(()=>fs.writeFileSync(p,original),250);');
  assertPolicyRejection(verify(store), policy);
  assert.equal(readFileSync(policy, 'utf8'), '');
});

test('initially absent and empty explicit global config files remain monitored authorities', t => {
  for (const exists of [false, true]) {
    const { root, store } = fixture(t);
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-global-authority-')));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    const policy = join(outside, 'global.config'), ignore = join(root, 'ignore.rules');
    writeFileSync(ignore, '/ephemeral.js\n');
    if (exists) writeFileSync(policy, '');
    const config = `[core]\nexcludesFile = ${JSON.stringify(ignore.replaceAll('\\', '/'))}\n`;
    writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),p=${JSON.stringify(policy)};fs.writeFileSync(p,${JSON.stringify(config)});fs.writeFileSync("ephemeral.js","used");fs.readFileSync("ephemeral.js");fs.unlinkSync("ephemeral.js");setTimeout(()=>${exists ? 'fs.writeFileSync(p,"")' : 'fs.unlinkSync(p)'},250);`);
    const original = process.env.GIT_CONFIG_GLOBAL;
    try { process.env.GIT_CONFIG_GLOBAL = policy; assertPolicyRejection(verify(store), policy); }
    finally { if (original === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = original; }
  }
});

test('an absent included configuration cannot transiently introduce an ignore rule', t => {
  const { root, store } = fixture(t);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-include-authority-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const policy = join(outside, 'included.config'), ignore = join(root, 'ignore.rules');
  writeFileSync(ignore, '/ephemeral.js\n');
  execFileSync('git', ['config', 'include.path', policy], { cwd: root });
  const config = `[core]\nexcludesFile = ${JSON.stringify(ignore.replaceAll('\\', '/'))}\n`;
  writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),p=${JSON.stringify(policy)};fs.writeFileSync(p,${JSON.stringify(config)});fs.writeFileSync("ephemeral.js","used");fs.readFileSync("ephemeral.js");fs.unlinkSync("ephemeral.js");setTimeout(()=>fs.unlinkSync(p),250);`);
  assertPolicyRejection(verify(store), policy);
});
