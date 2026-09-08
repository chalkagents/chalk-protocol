import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-finalization-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  return { root, store: new Store(root) };
}
function concurrent(t, root, code) {
  writeFileSync(join(root, 'writer.cjs'), `const fs=require('fs');${code}`);
  const child = spawn(process.execPath, ['writer.cjs'], { cwd: root, stdio: 'ignore' });
  t.after(() => child.kill('SIGKILL'));
  return child;
}
const awaitReceipt = `const started=Date.now();const timer=setInterval(()=>{
  const base='.chalk/local/verification';let found;
  try{for(const id of fs.readdirSync(base)){const path=base+'/'+id+'/run.json';const r=JSON.parse(fs.readFileSync(path));if(CONDITION){found={r,dir:base+'/'+id};break;}}}catch{}
  if(found){clearInterval(timer);ACTION;}
  if(Date.now()-started>10000)clearInterval(timer);
},1);`;

test('a file appearing after the initial snapshot cannot escape input membership', t => {
  const { root, store } = fixture(t);
  const meta = store.meta(); meta.protocol.verify = { test: 'node -e "console.log(require(\'fs\').readFileSync(\'late.js\',\'utf8\'))"' }; store.saveMeta(meta);
  concurrent(t, root, awaitReceipt.replace('CONDITION', 'r.before').replace('ACTION', 'fs.writeFileSync("late.js","used by command");'));
  // Delay the real worker constructor to make receipt-to-observer startup deterministic.
  const threads = createRequire(import.meta.url)('node:worker_threads'), Original = threads.Worker;
  threads.Worker = class extends Original {
    constructor(...args) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); super(...args); }
  };
  syncBuiltinESMExports();
  let result;
  try { result = verify(store); }
  finally { threads.Worker = Original; syncBuiltinESMExports(); }
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
});

for (const target of ['archive', 'configuration', 'tasks']) {
  test(`late ${target} damage during final observation cannot open the gate`, t => {
    const { root, store } = fixture(t);
    const meta = store.meta(); meta.protocol.verify = { test: 'node -e "console.log(\'proof\')"' }; store.saveMeta(meta);
    const action = target === 'archive'
      ? 'fs.writeFileSync(found.dir+"/test.stdout.log","");'
      : target === 'configuration'
        ? 'const p=".chalk/chalk.json",m=JSON.parse(fs.readFileSync(p));m.protocol.verify.test="node -e \\\"process.exit(9)\\\"";fs.writeFileSync(p,JSON.stringify(m));'
        : 'const p=".chalk/tasks.json",m=JSON.parse(fs.readFileSync(p));fs.writeFileSync(p,JSON.stringify(m,null,4));';
    concurrent(t, root, awaitReceipt.replace('CONDITION', 'r.toolchain.some(g=>g.gate==="test"&&g.finishedAt)').replace('ACTION', `setTimeout(()=>{${action}fs.writeFileSync(".chalk/local/damaged","yes");},100)`));
    const result = verify(store);
    assert.equal(readFileSync(join(root, '.chalk/local/damaged'), 'utf8'), 'yes');
    assert.equal(result.green, false, JSON.stringify(result));
    if (target === 'archive') {
      assert.match(result.evidenceError, /retained|archive|stream/i);
      const command = result.toolchain.find(g=>g.gate==='test');
      assert.match(readFileSync(command.stdoutPath, 'utf8'), /proof/);
      assert.ok(command.recovery, 'damaged archival must retain the private recovery copy');
    } else assert.equal(result.freshness, 'stale');
  });
}
