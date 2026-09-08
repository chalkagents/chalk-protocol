import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-namespace-lifecycle-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
  return { root, store };
}

test('a create/read/delete transition before observer startup closes the namespace gate', t => {
  const { root, store } = fixture(t);
  const threads = createRequire(import.meta.url)('node:worker_threads'), Original = threads.Worker;
  threads.Worker = class extends Original {
    constructor(...args) {
      fs.writeFileSync(join(root, 'ephemeral.js'), 'used');
      assert.equal(fs.readFileSync(join(root, 'ephemeral.js'), 'utf8'), 'used');
      fs.unlinkSync(join(root, 'ephemeral.js'));
      super(...args);
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = verify(store); }
  finally { threads.Worker = Original; syncBuiltinESMExports(); }
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
  assert.ok(result.observation.inputChanges.includes(`source-directory:${root}`));
});

test('missing notifications during the final drain cannot hide a vanished new input', t => {
  const { root } = fixture(t);
  fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import fsp from 'node:fs/promises';
    import{workerData}from'node:worker_threads';import{syncBuiltinESMExports}from'node:module';
    if(workerData?.mode==='monitor'){
      let stopping=false,fired=false;workerData.port.on('message',m=>{if(m.type==='stop')stopping=true;});
      const watch=fs.watch,stat=fsp.lstat;
      fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
        if(String(name)!=='ephemeral.js')cb(event,name);
      });};
      fsp.lstat=async(p,...args)=>{const value=await stat(p,...args);
        if(stopping&&!fired&&String(p).endsWith('test.stderr.log')){fired=true;setTimeout(()=>{
          const root=${JSON.stringify(root)};fs.writeFileSync(root+'/ephemeral.js','used');
          fs.readFileSync(root+'/ephemeral.js');fs.unlinkSync(root+'/ephemeral.js');
          fs.writeFileSync(root+'/.chalk/local/changed',String(Date.now()));
        },75);}return value;
      };syncBuiltinESMExports();
    }`);
  const script = `import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};
    import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};
    console.log(JSON.stringify(verify(new Store(${JSON.stringify(root)}))));`;
  const result = JSON.parse(execFileSync(process.execPath,
    ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 }));
  assert.ok(Number(fs.readFileSync(join(root, '.chalk/local/changed'), 'utf8')) <= Date.parse(result.finishedAt));
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
  assert.ok(result.observation.inputChanges.includes(`source-directory:${root}`));
});
