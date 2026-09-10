import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

for (const mode of ['gitfile', 'directory', 'nested']) {
  test(`temporary repository selection cannot hide source through ${mode}`, t => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-repository-selection-')));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const top = join(base, 'project'), alternate = join(base, 'alternate.git');
    mkdirSync(top);
    const git = (args, cwd = top) => execFileSync('git', args, { cwd, encoding: 'utf8' });
    git(['init', '-q', ...(mode === 'gitfile' ? ['--separate-git-dir', join(base, 'original.git')] : [])]);
    git(['init', '-q', '--separate-git-dir', alternate, join(base, 'alternate-work')]);
    writeFileSync(join(alternate, 'info/exclude'), '/ephemeral.js\n');
    const root = mode === 'nested' ? join(top, 'app') : top;
    if (mode === 'nested') mkdirSync(root);
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    const selector = join(root, '.git'), originalDir = join(base, 'saved.git');
    const prepare = mode === 'gitfile' ? 'const original=fs.readFileSync(".git");' : mode === 'directory' ? `fs.renameSync(".git",${JSON.stringify(originalDir)});` : '';
    const restore = mode === 'gitfile' ? 'fs.writeFileSync(".git",original)' : mode === 'directory' ? `fs.unlinkSync(".git");fs.renameSync(${JSON.stringify(originalDir)},".git")` : 'fs.unlinkSync(".git")';
    writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),{execFileSync:git}=require("child_process");${prepare}fs.writeFileSync(".git",${JSON.stringify(`gitdir: ${alternate.replaceAll('\\', '/')}\n`)});fs.writeFileSync("ephemeral.js","used");git("git",["check-ignore","ephemeral.js"]);console.log(fs.readFileSync("ephemeral.js","utf8"));fs.unlinkSync("ephemeral.js");setTimeout(()=>{${restore}},500);`);
    const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
    const result = verify(store), command = result.toolchain.find(g => g.gate === 'test');
    assert.equal(result.toolchainGreen, true, JSON.stringify(command));
    assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
    assert.match(readFileSync(command.stdoutPath, 'utf8'), /used/);
    const receipt = JSON.parse(readFileSync(result.evidence.path, 'utf8'));
    assert.ok(Object.hasOwn(receipt.before.source.membershipInputs, selector));
    assert.equal(receipt.before.source.digest, receipt.after.source.digest, 'final source/config files alone miss the temporary repository switch');
    assert.ok(command.inputChanges.some(p => p.startsWith('git-membership:')), JSON.stringify(command));
  });
}
