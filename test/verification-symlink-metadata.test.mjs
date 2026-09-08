import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-symlink-metadata-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  fs.mkdirSync(join(root, 'build')); fs.writeFileSync(join(root, '.gitignore'), '/build/\n');
  fs.writeFileSync(join(root, 'source.js'), 'original'); fs.writeFileSync(join(root, 'other.js'), 'changed');
  fs.symlinkSync('../source.js', join(root, 'build/input.js'), 'file');
  execFileSync('git', ['add', '-f', 'build/input.js'], { cwd: root });
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
  return { root, store };
}

for (const stage of ['startup', 'final-collection']) {
  test(`restoring a tracked symlink target at ${stage} cannot hide replacement`, t => {
    const { root } = fixture(t), link = join(root, 'build/input.js');
    fs.writeFileSync(join(root, 'preload.mjs'), `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
      const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{
        if(String(name)!=='input.js')cb(event,name);
      });};syncBuiltinESMExports();`);
    const action = `fs.unlinkSync(${JSON.stringify(link)});fs.symlinkSync('../other.js',${JSON.stringify(link)},'file');
      if(fs.readFileSync(${JSON.stringify(link)},'utf8')!=='changed')throw Error('replacement not read');
      fs.unlinkSync(${JSON.stringify(link)});fs.symlinkSync('../source.js',${JSON.stringify(link)},'file');`;
    const setup = stage === 'startup' ? `const threads=createRequire(import.meta.url)('node:worker_threads'),Original=threads.Worker;
      threads.Worker=class extends Original{constructor(...args){${action}super(...args);}};syncBuiltinESMExports();`
      : `const protocol=store.protocol.bind(store);let calls=0;store.protocol=()=>{const value=protocol();if(++calls===2){${action}}return value;};`;
    const script = `import fs from 'node:fs';import{createRequire,syncBuiltinESMExports}from'node:module';
      import{Store}from${JSON.stringify(new URL('../lib/store.mjs', import.meta.url).href)};
      import{verify}from${JSON.stringify(new URL('../lib/verify.mjs', import.meta.url).href)};
      const store=new Store(${JSON.stringify(root)});${setup}console.log(JSON.stringify(verify(store)));`;
    const result = JSON.parse(execFileSync(process.execPath,
      ['--import', join(root, 'preload.mjs'), '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 }));
    assert.equal(fs.readlinkSync(link), '../source.js');
    assert.equal(fs.readFileSync(link, 'utf8'), 'original');
    assert.equal(result.toolchainGreen, true, JSON.stringify(result));
    assert.equal(result.green, false, JSON.stringify(result));
    assert.equal(result.freshness, 'stale');
  });
}

test('an unchanged tracked symlink permits legitimate ignored sibling output', t => {
  const { root, store } = fixture(t), meta = store.meta();
  meta.protocol.verify.test = 'node -e "const fs=require(\'fs\');console.log(fs.readFileSync(\'build/input.js\',\'utf8\'));fs.writeFileSync(\'build/output.log\',\'generated\');"';
  store.saveMeta(meta);
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  assert.equal(result.freshness, 'fresh');
  assert.equal(fs.readFileSync(join(root, 'build/output.log'), 'utf8'), 'generated');
  assert.equal(fs.readlinkSync(join(root, 'build/input.js')), '../source.js');
});
