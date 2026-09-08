import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

for (const target of ['source', 'archive']) {
  test(`${target} remains protected while the final archive validation runs`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-completion-boundary-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    fs.writeFileSync(join(root, 'source.js'), 'before');
    const change = target === 'source' ? 'fs.writeFileSync("source.js","after");' : 'fs.writeFileSync(path,"");';
    fs.writeFileSync(join(root, 'writer.cjs'), `const fs=require('fs');const started=Date.now();const timer=setInterval(()=>{
      try{const path=fs.readFileSync('.chalk/local/trigger','utf8');${change}fs.writeFileSync('.chalk/local/changed','yes');clearInterval(timer);}catch{}
      if(Date.now()-started>10000)clearInterval(timer);
    },1);`);
    const writer = spawn(process.execPath, ['writer.cjs'], { cwd: root, stdio: 'ignore' });
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node -e "console.log(\'out\');console.error(\'err\')"' }; store.saveMeta(meta);
    const original = fs.readSync; let reads = 0, triggered = false, result;
    fs.readSync = (fd, ...args) => {
      const base = join(root, '.chalk/local/verification');
      const names = fs.readdirSync(base);
      const dir = names.length && join(base, names[0]);
      const path = dir && join(dir, target === 'source' ? 'test.stdout.log' : 'test.stderr.log');
      if (path && fs.existsSync(path) && fs.fstatSync(fd).ino === fs.statSync(path).ino && ++reads === 2) {
        triggered = true;
        fs.writeFileSync(join(root, '.chalk/local/trigger'), join(dir, 'test.stdout.log'));
        const until = Date.now() + 5000;
        while (!fs.existsSync(join(root, '.chalk/local/changed')) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        assert.ok(fs.existsSync(join(root, '.chalk/local/changed')), 'concurrent writer must run during final validation');
      }
      return original(fd, ...args);
    };
    syncBuiltinESMExports();
    try { result = verify(store); }
    finally { fs.readSync = original; syncBuiltinESMExports(); writer.kill('SIGKILL'); }
    assert.equal(triggered, true, 'exercise the second archive validation');
    assert.equal(result.green, false, JSON.stringify(result));
    if (target === 'source') {
      assert.equal(fs.readFileSync(join(root, 'source.js'), 'utf8'), 'after');
      assert.equal(result.freshness, 'stale');
    } else {
      const command = result.toolchain.find(g => g.gate === 'test');
      assert.match(result.evidenceError, /archive|evidence/i);
      assert.equal(fs.readFileSync(command.stdoutPath, 'utf8'), 'out\n');
      assert.ok(command.recovery, 'damaged evidence retains recoverable bytes');
    }
  });
}

test('verification called from Node module input starts its file-backed observer', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-module-input-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
  const script = `import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};console.log(JSON.stringify(verify(new Store(${JSON.stringify(root)}))));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 8000 }));
  assert.equal(result.green, true, JSON.stringify(result));
  const receipt = JSON.parse(fs.readFileSync(result.evidence.path, 'utf8'));
  assert.equal(receipt.finishedAt, result.finishedAt);
  assert.ok(Number.isFinite(Date.parse(receipt.finishedAt)));
});
