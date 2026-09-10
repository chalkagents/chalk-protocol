import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { verify } from '../lib/verify.mjs';

test('restored ignore-policy writes remain reported when watcher notifications are delayed past closure', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-policy-notifications-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  const policy = resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: root, encoding: 'utf8' }).trim());
  writeFileSync(join(root, 'drop-watch.cjs'), 'const fs=require("node:fs"),watch=fs.watch;fs.watch=(path,listener)=>watch(path,()=>{});require("node:module").syncBuiltinESMExports();');
  writeFileSync(join(root, 'check.cjs'), `const fs=require("fs"),p=${JSON.stringify(policy)},original=fs.readFileSync(p);fs.writeFileSync(p,"/ephemeral.js\\n");fs.writeFileSync(p,original);`);
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  const originalOptions = process.env.NODE_OPTIONS;
  let result;
  try { process.env.NODE_OPTIONS = `${originalOptions || ''} --require ${JSON.stringify(join(root, 'drop-watch.cjs'))}`; result = verify(store); }
  finally { if (originalOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = originalOptions; }
  assert.equal(result.green, false); assert.equal(result.freshness, 'stale');
  const command = result.toolchain.find(g => g.gate === 'test');
  assert.equal(command.exitCode, 0);
  assert.ok(command.inputChanges.includes(`git-policy:${policy}`), JSON.stringify(command));
});
