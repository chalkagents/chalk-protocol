import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_VERIFICATION_TIMEOUT_MS, runToolchain, verify } from '../lib/verify.mjs';
import { runSpecs } from '../lib/e2e.mjs';
import { Store } from '../lib/store.mjs';

test('source-bound toolchain and E2E commands receive the effective twenty-minute default', t => {
  assert.equal(DEFAULT_VERIFICATION_TIMEOUT_MS, 20 * 60 * 1000);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-timeout-contract-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const toolchainRequests = [];
  runToolchain(root, { test: 'test-command' }, {
    runCommand: request => { toolchainRequests.push(request); return { status: 'pass' }; },
  });
  assert.equal(toolchainRequests[0].timeoutMs, DEFAULT_VERIFICATION_TIMEOUT_MS);
  const overridden = [];
  runToolchain(root, { test: 'test-command' }, {
    timeoutMs: 1234,
    runCommand: request => { overridden.push(request); return { status: 'pass' }; },
  });
  assert.equal(overridden[0].timeoutMs, 1234, 'explicit per-invocation limits remain authoritative');

  writeFileSync(join(root, 'flow.test.yaml'), 'id: timeout-flow\nsteps: []\n');
  const e2eRequests = [];
  const protocol = { e2e: { command: 'browser-command' } };
  runSpecs({ protocol: () => protocol }, root, ['flow.test.yaml'], {
    protocol,
    execute: (_command, options) => { e2eRequests.push(options); return { status: 'pass' }; },
  });
  assert.equal(e2eRequests[0].timeoutMs, DEFAULT_VERIFICATION_TIMEOUT_MS);
});

test('full verification records the same default on toolchain and E2E executions', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-timeout-evidence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  writeFileSync(join(root, 'check.cjs'), 'console.log("toolchain")');
  writeFileSync(join(root, 'browser.cjs'), 'console.log("browser")');
  writeFileSync(join(root, 'flow.test.yaml'), 'id: timeout-evidence\nsteps: []\n');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node check.cjs' };
  meta.protocol.e2e.command = 'node browser.cjs';
  store.saveMeta(meta);
  store.upsertTask({
    id: 'task-timeout', title: 'timeout evidence', state: 'in-progress',
    acceptanceCriteria: [{ text: 'timeouts are recorded' }],
    tests: [store.lockTest(join(root, 'flow.test.yaml'))], reviews: [],
  });
  const result = verify(store);
  assert.equal(result.green, true, JSON.stringify(result));
  const toolchain = result.toolchain.find(gate => gate.gate === 'test');
  assert.equal(toolchain.timeoutMs, DEFAULT_VERIFICATION_TIMEOUT_MS);
  assert.equal(result.e2e[0].execution.timeoutMs, DEFAULT_VERIFICATION_TIMEOUT_MS);
});
