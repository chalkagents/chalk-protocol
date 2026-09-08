import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

for (const stage of ['startup', 'final-collection']) {
  test(`absent tracked input inside ignored output stays protected at ${stage}`, t => {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-absent-tracked-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    fs.mkdirSync(join(root, 'build')); fs.writeFileSync(join(root, '.gitignore'), '/build/\n');
    fs.writeFileSync(join(root, 'build/input.js'), 'tracked');
    execFileSync('git', ['add', '-f', 'build/input.js'], { cwd: root });
    fs.unlinkSync(join(root, 'build/input.js'));
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
    fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
      const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
        if(String(name)!=='input.js')cb(event,name);
      });};syncBuiltinESMExports();`);
    const action = `fs.writeFileSync(${JSON.stringify(join(root, 'build/input.js'))},'used');
      if(fs.readFileSync(${JSON.stringify(join(root, 'build/input.js'))},'utf8')!=='used')throw Error('fixture not read');
      fs.unlinkSync(${JSON.stringify(join(root, 'build/input.js'))});`;
    const setup = stage === 'startup' ? `const threads=createRequire(import.meta.url)('node:worker_threads'),Original=threads.Worker;
      threads.Worker=class extends Original{constructor(...args){${action}super(...args);}};syncBuiltinESMExports();`
      : `const protocol=store.protocol.bind(store);let calls=0;store.protocol=()=>{const value=protocol();if(++calls===2){${action}}return value;};`;
    const script = `import fs from 'node:fs';import{createRequire,syncBuiltinESMExports}from'node:module';
      import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};
      import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};
      const store=new Store(${JSON.stringify(root)});${setup}console.log(JSON.stringify(verify(store)));`;
    const result = JSON.parse(execFileSync(process.execPath,
      ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 }));
    assert.equal(result.toolchainGreen, true, JSON.stringify(result));
    assert.equal(result.green, false, JSON.stringify(result));
    assert.ok(['stale', 'unknown'].includes(result.freshness), JSON.stringify(result));
    assert.equal(fs.existsSync(join(root, 'build/input.js')), false);
  });
}
