import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

for (const mode of ['external-ignore', 'empty-global-config', 'ancestor-root']) {
  test(`Git path discovery preserves significant trailing spaces in ${mode}`, t => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-git-paths-')));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const top = join(base, mode === 'ancestor-root' ? 'project ' : 'project');
    mkdirSync(top); execFileSync('git', ['init', '-q'], { cwd: top });
    const root = mode === 'ancestor-root' ? join(top, 'app') : top;
    if (root !== top) mkdirSync(root);
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    const policy = mode === 'ancestor-root' ? join(top, '.gitignore') : join(base, mode === 'external-ignore' ? 'ignore.rules ' : 'global.config ');
    const rules = join(base, 'stable.rules'); writeFileSync(rules, '/ephemeral.js\n'); writeFileSync(policy, '');
    if (mode === 'external-ignore') execFileSync('git', ['config', 'core.excludesFile', policy], { cwd: root });
    const value = mode === 'empty-global-config' ? `[core]\nexcludesFile = ${JSON.stringify(rules.replaceAll('\\', '/'))}\n` : mode === 'ancestor-root' ? '/app/ephemeral.js\n' : '/ephemeral.js\n';
    writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),{execFileSync:git}=require("child_process"),p=${JSON.stringify(policy)};fs.writeFileSync(p,${JSON.stringify(value)});fs.writeFileSync("ephemeral.js","used");git("git",["check-ignore","ephemeral.js"]);console.log(fs.readFileSync("ephemeral.js","utf8"));fs.unlinkSync("ephemeral.js");setTimeout(()=>fs.writeFileSync(p,""),500);`);
    const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    const original = process.env.GIT_CONFIG_GLOBAL;
    let result;
    try { if (mode === 'empty-global-config') process.env.GIT_CONFIG_GLOBAL = policy; result = verify(store); }
    finally { if (original === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = original; }
    const command = result.toolchain.find(g => g.gate === 'test');
    assert.equal(command.exitCode, 0, JSON.stringify(command));
    assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
    assert.match(readFileSync(command.stdoutPath, 'utf8'), /used/);
    const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
    assert.ok(Object.hasOwn(receipt.before.source.policyInputs, policy));
    assert.ok(command.inputChanges.includes(`git-policy:${policy}`));
  });
}
