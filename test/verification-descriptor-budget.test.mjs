import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';

test('nested verification monitors stay within a conservative descriptor budget', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-verification-fds-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = resolve('bin/chalk.mjs');
  execFileSync(process.execPath, [cli, 'init', '--bare'], { cwd: root });
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (let index = 0; index < 220; index++) {
    const dir = join(root, 'source', String(index).padStart(3, '0'));
    fs.mkdirSync(dir, { recursive: true });
    if (index < 20) fs.writeFileSync(join(dir, 'input.js'), `export default ${index};\n`);
  }
  execFileSync('git', ['add', '-A'], { cwd: root });

  const preload = join(root, 'watch-budget.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const watch = fs.watch; let opened = 0;
fs.watch = (...args) => {
  if (args[1] && typeof args[1] === 'object' && args[1].recursive) { const error = new Error('recursive watch unavailable'); error.code = 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'; throw error; }
  if (++opened > 64) { const error = new Error('watch descriptor budget exceeded'); error.code = 'EMFILE'; throw error; }
  return watch(...args);
};
syncBuiltinESMExports();
`);

  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: `${JSON.stringify(process.execPath)} -e "process.exit(0)"` };
  store.saveMeta(meta);

  const result = spawnSync(process.execPath, [cli, 'verify'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--import=${preload}` },
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /GREEN/);
});
