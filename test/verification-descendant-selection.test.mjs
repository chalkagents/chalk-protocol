import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

for (const mode of ['gitfile', 'directory']) {
  test(`descendant classification rejects temporary ${mode} repository selection`, t => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-descendant-selection-')));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const root = join(base, 'project'), alternate = join(base, 'alternate.git');
    mkdirSync(root); mkdirSync(join(root, 'empty'));
    const git = args => execFileSync('git', args, { cwd: root });
    git(['init', '-q']); git(['init', '-q', '--separate-git-dir', alternate, join(base, 'alternate-work')]);
    writeFileSync(join(alternate, 'info/exclude'), '/ephemeral.js\n');
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    const select = mode === 'gitfile'
      ? `fs.writeFileSync("empty/.git",${JSON.stringify(`gitdir: ${alternate.replaceAll('\\', '/')}\n`)})`
      : `fs.cpSync(${JSON.stringify(alternate)},"empty/.git",{recursive:true})`;
    writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),{execFileSync:git}=require("child_process");${select};fs.writeFileSync("empty/ephemeral.js","used");git("git",["check-ignore","ephemeral.js"],{cwd:"empty"});console.log(fs.readFileSync("empty/ephemeral.js","utf8"));fs.unlinkSync("empty/ephemeral.js");setTimeout(()=>fs.rmSync("empty/.git",{recursive:true}),500);`);
    const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    const result = verify(store), command = result.toolchain.find(g => g.gate === 'test');
    assert.equal(result.toolchainGreen, true, JSON.stringify(command));
    assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
    assert.ok(command.inputChanges.includes(`git-membership:${join(root, 'empty/.git')}`), JSON.stringify(command));
    assert.match(readFileSync(command.stdoutPath, 'utf8'), /used/);
    const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
    assert.equal(receipt.before.source.digest, receipt.after.source.digest);
  });
}
