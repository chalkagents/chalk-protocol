import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

test('restored shared-index bytes before observer startup cannot reset the metadata baseline', t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-shared-startup-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  fs.writeFileSync(join(root, 'input.js'), 'source');
  execFileSync('git', ['add', 'input.js'], { cwd: root });
  execFileSync('git', ['update-index', '--split-index'], { cwd: root });
  const shared = resolve(root, execFileSync('git', ['rev-parse', '--shared-index-path'], { cwd: root, encoding: 'utf8' }).trim());
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node -e "console.log(1)"' }; store.saveMeta(meta);
  const threads = createRequire(import.meta.url)('node:worker_threads'), Original = threads.Worker;
  threads.Worker = class extends Original {
    constructor(...args) {
      const bytes = fs.readFileSync(shared);
      fs.writeFileSync(shared, 'temporary'); assert.equal(fs.readFileSync(shared, 'utf8'), 'temporary');
      fs.writeFileSync(shared, bytes); super(...args);
    }
  };
  syncBuiltinESMExports();
  let result;
  try { result = verify(store); }
  finally { threads.Worker = Original; syncBuiltinESMExports(); }
  assert.equal(result.toolchainGreen, true, JSON.stringify(result));
  assert.equal(result.green, false, JSON.stringify(result));
  assert.equal(result.freshness, 'stale');
  assert.ok(result.observation.inputChanges.includes(`git-membership:${shared}`), JSON.stringify(result.observation));
});
