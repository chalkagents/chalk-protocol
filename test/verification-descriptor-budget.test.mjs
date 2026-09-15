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

  const preload = join(root, 'watch-budget.cjs');
  fs.writeFileSync(preload, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const watch = fs.watch; let opened = 0;
fs.watch = (...args) => {
  if (args[1] && typeof args[1] === 'object' && args[1].recursive) { const error = new Error('recursive watch unavailable'); error.code = 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'; throw error; }
  if (++opened > 64) { const error = new Error('watch descriptor budget exceeded'); error.code = 'EMFILE'; throw error; }
  return watch(...args);
};
syncBuiltinESMExports();
`);

  const store = new Store(root), meta = store.meta();
  fs.writeFileSync(join(root, 'mutate-unwatched.cjs'),
    'const fs=require("node:fs");fs.writeFileSync("source/219/transient.js","used");fs.unlinkSync("source/219/transient.js");');
  meta.protocol.verify = { test: `${JSON.stringify(process.execPath)} mutate-unwatched.cjs` };
  store.saveMeta(meta);

  const result = spawnSync(process.execPath, [cli, 'verify'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--require=${JSON.stringify(preload)}` },
    timeout: 120_000,
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /RED/);
  const evidence = join(root, '.chalk', 'local', 'verification');
  const runs = fs.readdirSync(evidence);
  assert.equal(runs.length, 1);
  const record = JSON.parse(fs.readFileSync(join(evidence, runs[0], 'run.json'), 'utf8'));
  assert.equal(record.freshness, 'stale');
  const command = record.toolchain.find(gate => gate.gate === 'test');
  assert.equal(command.monitorError, null);
  assert.ok(command.inputChanges.some(path => path.includes(join('source', '219'))), JSON.stringify(command));
  assert.doesNotMatch(JSON.stringify(record), /watch descriptor budget exceeded|EMFILE/);
});
