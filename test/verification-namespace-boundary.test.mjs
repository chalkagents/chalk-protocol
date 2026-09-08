import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

for (const ignoredOutput of [false, true]) {
  test(`vanished source closes verification despite missing notification${ignoredOutput ? ' alongside ignored output' : ''}`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-namespace-boundary-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    fs.writeFileSync(join(root, '.gitignore'), '/build\n');
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
    // Simulate the platform delivering every other notification before the source
    // notification. Completion cannot infer that an empty callback queue is complete.
    fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
      const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
        if(String(name)!=='ephemeral.js')cb(event,name);
      });};syncBuiltinESMExports();`);
    const script = `import fs from 'node:fs';
      import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};
      import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};
      const root=${JSON.stringify(root)},store=new Store(root),protocol=store.protocol.bind(store);let calls=0,used;
      store.protocol=()=>{const value=protocol();if(++calls===2){
        fs.writeFileSync(root+'/ephemeral.js','used during verification');
        used=fs.readFileSync(root+'/ephemeral.js','utf8');fs.unlinkSync(root+'/ephemeral.js');
        ${ignoredOutput ? "fs.mkdirSync(root+'/build');fs.writeFileSync(root+'/build/output.log','generated');fs.rmSync(root+'/build',{recursive:true});" : ''}
      }return value;};const result=verify(store);console.log(JSON.stringify({result,calls,used}));`;
    const { result, calls, used } = JSON.parse(execFileSync(process.execPath,
      ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 }));
    assert.equal(calls, 2, 'mutation occurs during final input collection');
    assert.equal(used, 'used during verification');
    assert.equal(fs.existsSync(join(root, 'ephemeral.js')), false);
    assert.equal(result.toolchainGreen, true, JSON.stringify(result));
    assert.equal(result.green, false, JSON.stringify(result));
    assert.ok(['unknown', 'stale'].includes(result.freshness), JSON.stringify(result));
  });
}
