import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store } from '../lib/store.mjs';
import { sourceIdentity } from '../lib/verification-record.mjs';
import { brokeCheck } from '../lib/brokecheck.mjs';
import { runToolchain, verify } from '../lib/verify.mjs';

test('merge local verification fallback leaves inspectable evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-record-merge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), 'console.log("merge verified")');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' }; store.saveMeta(meta);
  assert.equal(brokeCheck(store, {}, { classify: () => 'none' }).ok, true);
  const base = join(root, '.chalk/local/verification');
  const [id] = readdirSync(base);
  const record = JSON.parse(readFileSync(join(base, id, 'run.json')));
  assert.equal(record.green, true);
  assert.match(readFileSync(record.toolchain.find(g => g.gate === 'test').stdoutPath, 'utf8'), /merge verified/);
});

test('filesystem manifest includes browser contracts but not protocol bookkeeping', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-record-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.chalk/tests'), { recursive: true });
  writeFileSync(join(root, '.chalk/tests/browser.test.yaml'), 'steps: []');
  writeFileSync(join(root, '.chalk/tasks.json'), '[]');
  const source = sourceIdentity(root);
  assert.ok(source.files['.chalk/tests/browser.test.yaml']);
  assert.ok(!source.files['.chalk/tasks.json']);
});

test('symlink content outside the manifest cannot be certified as known', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-record-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'node_modules')); writeFileSync(join(root, 'node_modules/dep.js'), 'x');
  symlinkSync(join(root, 'node_modules'), join(root, 'source'), 'junction');
  assert.equal(sourceIdentity(root).status, 'unknown');
});

test('configured gate commands preserve shell environment assignment semantics', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-record-shell-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'check.cjs'), 'process.stdout.write(process.env.CHALK_RECORD_VALUE || "missing")');
  const command = process.platform === 'win32' ? 'set CHALK_RECORD_VALUE=assigned&& node check.cjs' : 'CHALK_RECORD_VALUE=assigned node check.cjs';
  const result = runToolchain(root, { test: command }).find(g => g.gate === 'test');
  assert.equal(result.status, 'pass');
  assert.equal(readFileSync(result.stdoutPath, 'utf8'), 'assigned');
});

test('live verification output does not trigger the read-only agent mutation guard', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-record-readonly-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  const runner = pathToFileURL(resolve('lib/agent-runner.mjs')).href;
  writeFileSync(join(root, 'fake.cjs'), 'setTimeout(() => console.log("reviewed"), 800)');
  writeFileSync(join(root, 'check.mjs'), `
    import { spawn } from 'node:child_process';
    import { runAgent } from ${JSON.stringify(runner)};
    const writer = spawn(process.execPath, ['-e', 'setInterval(() => console.log("progress"), 5)'], { stdio: ['ignore', 1, 2] });
    try {
      const result = runAgent('planner', { cwd: process.cwd(), command: 'node fake.cjs', input: 'read only', output: { kind: 'text' } });
      console.log(JSON.stringify(result));
      if (result.status !== 'ok') process.exitCode = 1;
    } finally { writer.kill(); }
  `);
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.mjs' }; store.saveMeta(meta);
  const v = verify(store);
  assert.equal(v.green, true, JSON.stringify(v));
  const log = readFileSync(v.toolchain.find(g => g.gate === 'test').stdoutPath, 'utf8');
  assert.match(log, /progress/);
  assert.match(log, /reviewed/);
  assert.doesNotMatch(log, /read-only-mutation/);
});
