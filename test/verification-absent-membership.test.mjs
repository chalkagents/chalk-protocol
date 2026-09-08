import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

for (const stage of ['startup', 'final-collection']) {
  test(`absent ancestor repository selector retains its parent namespace at ${stage}`, t => {
    const top = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-absent-membership-')));
    const middle = join(top, 'middle'), root = join(middle, 'app');
    fs.mkdirSync(root, { recursive: true }); t.after(() => fs.rmSync(top, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q'], { cwd: top });
    execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
    // Present ignore files prevent absent-policy guards from accidentally covering
    // the missing repository selector in this ancestor outside the source root.
    for (const dir of [top, middle, root]) fs.writeFileSync(join(dir, '.gitignore'), '');
    const store = new Store(root), meta = store.meta();
    meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
    fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
      const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
        if(String(name)!=='.git')cb(event,name);
      });};syncBuiltinESMExports();`);
    const path = join(middle, '.git'), contents = `gitdir: ${join(top, '.git')}\n`;
    const action = `fs.writeFileSync(${JSON.stringify(path)},${JSON.stringify(contents)});
      if(fs.readFileSync(${JSON.stringify(path)},'utf8')!==${JSON.stringify(contents)})throw Error('fixture not read');
      fs.unlinkSync(${JSON.stringify(path)});`;
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
  });
}
