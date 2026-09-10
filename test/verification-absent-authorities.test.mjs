import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

for (const target of ['visible-tests', 'external-ignore', 'nested-external-ignore', 'ignored-include']) {
  for (const stage of ['startup', 'final-collection']) {
    test(`absent ${target} create/read/delete at ${stage} closes verification`, t => {
      const top = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-absent-authority-'))), root = join(top, 'app');
      fs.mkdirSync(root); t.after(() => fs.rmSync(top, { recursive: true, force: true }));
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
      const external = join(top, 'policy'); fs.mkdirSync(external);
      const path = target === 'visible-tests' ? join(root, '.chalk/tests/ephemeral.js')
        : target === 'ignored-include' ? join(root, 'build/.gitignore')
        : join(external, ...(target === 'nested-external-ignore' ? ['missing'] : []), 'ignore.rules');
      if (target === 'ignored-include') {
        fs.mkdirSync(join(root, 'build')); fs.writeFileSync(join(root, '.gitignore'), '/build\n');
        execFileSync('git', ['config', 'include.path', path], { cwd: root });
      } else if (target !== 'visible-tests') execFileSync('git', ['config', 'core.excludesFile', path], { cwd: root });
      const store = new Store(root), meta = store.meta();
      meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
      const removed = ['external-ignore', 'ignored-include'].includes(target) ? path : dirname(path);
      const action = `fs.mkdirSync(${JSON.stringify(dirname(path))},{recursive:true});fs.writeFileSync(${JSON.stringify(path)},'used');
        const used=fs.readFileSync(${JSON.stringify(path)},'utf8');if(used!=='used')throw Error('fixture not read');
        fs.rmSync(${JSON.stringify(removed)},{recursive:true});`;
      fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
        const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
          if(!['tests','ephemeral.js','ignore.rules','missing','.gitignore'].includes(String(name)))cb(event,name);
        });};syncBuiltinESMExports();`);
      const setup = stage === 'startup' ? `const threads=createRequire(import.meta.url)('node:worker_threads'),Original=threads.Worker;
        threads.Worker=class extends Original{constructor(...args){${action}super(...args);}};syncBuiltinESMExports();`
        : `const protocol=store.protocol.bind(store);let calls=0;store.protocol=()=>{const value=protocol();if(++calls===2){${action}}return value;};`;
      const script = `import fs from 'node:fs';import{createRequire,syncBuiltinESMExports}from'node:module';
        import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};
        import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};
        const store=new Store(${JSON.stringify(root)});${setup}console.log(JSON.stringify(verify(store)));`;
      const result = JSON.parse(execFileSync(process.execPath,
        ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 }));
      assert.equal(fs.existsSync(path), false);
      assert.equal(result.toolchainGreen, true, JSON.stringify(result));
      assert.equal(result.green, false, JSON.stringify(result));
      assert.ok(['stale', 'unknown'].includes(result.freshness), JSON.stringify(result));
    });
  }
}
