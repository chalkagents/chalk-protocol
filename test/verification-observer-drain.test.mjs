import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Store } from '../lib/store.mjs';

for (const target of ['source', 'archive']) {
  test(`${target} writes during the observer's final contract read close the gate`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-observer-drain-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    fs.writeFileSync(join(root, 'source.js'), 'before');
    const contract = join(root, '.chalk/chalk.json');
    fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import fsp from 'node:fs/promises';import{workerData}from'node:worker_threads';import{syncBuiltinESMExports}from'node:module';
      if(workerData?.mode==='monitor'){
        let fired=false;const read=fs.readFileSync,open=fsp.open;
        const match=p=>!fired&&String(p)===${JSON.stringify(contract)};
        const begin=()=>{fired=true;fs.writeFileSync(${JSON.stringify(join(root, '.chalk/local/trigger'))},'go');};
        const done=()=>fs.existsSync(${JSON.stringify(join(root, '.chalk/local/changed'))});
        fs.readFileSync=(p,...args)=>{if(match(p)){begin();const until=Date.now()+5000;while(!done()&&Date.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}return read(p,...args);};
        fsp.open=async(p,...args)=>{if(match(p)){begin();const until=Date.now()+5000;while(!done()&&Date.now()<until)await new Promise(r=>setTimeout(r,10));}return open(p,...args);};
        syncBuiltinESMExports();
      }`);
    const change = target === 'source'
      ? 'fs.writeFileSync("source.js","after");'
      : 'const base=".chalk/local/verification",id=fs.readdirSync(base)[0];fs.writeFileSync(base+"/"+id+"/test.stdout.log","");';
    fs.writeFileSync(join(root, 'writer.cjs'), `const fs=require('fs');const started=Date.now();const timer=setInterval(()=>{
      if(fs.existsSync('.chalk/local/trigger')){${change}fs.writeFileSync('.chalk/local/changed',String(Date.now()));clearInterval(timer);}
      if(Date.now()-started>10000)clearInterval(timer);
    },1);`);
    const meta = new Store(root).meta(); meta.protocol.verify = { test: 'node -e "console.log(\'out\')"' }; new Store(root).saveMeta(meta);
    const writer = spawn(process.execPath, ['writer.cjs'], { cwd: root, stdio: 'ignore' });
    const script = `import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};console.log(JSON.stringify(verify(new Store(${JSON.stringify(root)}))));`;
    let result;
    try { result = JSON.parse(execFileSync(process.execPath, ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 })); }
    finally { writer.kill('SIGKILL'); }
    const changedAt = Number(fs.readFileSync(join(root, '.chalk/local/changed'), 'utf8'));
    assert.ok(changedAt <= Date.parse(result.finishedAt), 'the mutation must precede the recorded completion boundary');
    assert.equal(result.green, false, JSON.stringify(result));
    if (target === 'source') assert.equal(result.freshness, 'stale');
    else {
      const command = result.toolchain.find(g => g.gate === 'test');
      assert.match(result.evidenceError, /archive|evidence/i);
      assert.equal(fs.readFileSync(command.stdoutPath, 'utf8'), 'out\n');
      assert.ok(command.recovery);
      t.after(() => fs.rmSync(command.recovery.dir, { recursive: true, force: true }));
    }
  });
}
