import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Store } from '../lib/store.mjs';

test('slow ignored-output classification cannot hide a source write at completion', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-observer-classification-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  fs.writeFileSync(join(root, '.gitignore'), 'generated.tmp\n');
  fs.writeFileSync(join(root, 'source.js'), 'before');
  const shim = `const fs=require('fs'),cp=require('child_process');fs.writeFileSync(${JSON.stringify(join(root, '.chalk/local/classifying'))},'yes');setTimeout(()=>{const r=cp.spawnSync('git',ARGS,{encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??2;},500);`;
  fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import fsp from 'node:fs/promises';import cp from 'node:child_process';import{workerData}from'node:worker_threads';import{syncBuiltinESMExports}from'node:module';
    if(workerData?.mode==='monitor'){
      let stopping=false,fired=false;workerData.port.on('message',m=>{if(m.type==='stop')stopping=true;});
      const stat=fsp.lstat,sync=cp.spawnSync,asyncSpawn=cp.spawn;
      fsp.lstat=async(p,...args)=>{const value=await stat(p,...args);if(stopping&&!fired&&String(p).endsWith('test.stderr.log')){fired=true;setTimeout(()=>fs.writeFileSync(${JSON.stringify(join(root, 'generated.tmp'))},'output'),75);}return value;};
      const matches=(cmd,args)=>stopping&&cmd==='git'&&args.includes('check-ignore')&&args.includes('generated.tmp');
      const code=args=>${JSON.stringify(shim)}.replace('ARGS',JSON.stringify(args));
      cp.spawnSync=(cmd,args,options)=>matches(cmd,args)?sync(process.execPath,['-e',code(args)],options):sync(cmd,args,options);
      cp.spawn=(cmd,args,options)=>matches(cmd,args)?asyncSpawn(process.execPath,['-e',code(args)],options):asyncSpawn(cmd,args,options);
      syncBuiltinESMExports();
    }`);
  fs.writeFileSync(join(root, 'writer.cjs'), `const fs=require('fs');const started=Date.now();const timer=setInterval(()=>{if(fs.existsSync('.chalk/local/classifying')){fs.writeFileSync('source.js','after');fs.writeFileSync('.chalk/local/changed',String(Date.now()));clearInterval(timer);}if(Date.now()-started>12000)clearInterval(timer);},1);`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node -e "console.log(1);console.error(2)"' }; store.saveMeta(meta);
  const writer = spawn(process.execPath, ['writer.cjs'], { cwd: root, stdio: 'ignore' });
  const script = `import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};console.log(JSON.stringify(verify(new Store(${JSON.stringify(root)}))));`;
  let result;
  try { result = JSON.parse(execFileSync(process.execPath, ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 })); }
  finally { writer.kill('SIGKILL'); }
  assert.equal(fs.readFileSync(join(root, 'source.js'), 'utf8'), 'after');
  assert.ok(Number(fs.readFileSync(join(root, '.chalk/local/changed'), 'utf8')) <= Date.parse(result.finishedAt));
  assert.equal(result.toolchainGreen, true);
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
});
