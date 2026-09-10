import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normGate } from '../lib/config.mjs';
import { runToolchain } from '../lib/verify.mjs';

test('per-command timeout overrides the caller default, is recorded, and still terminates overdue execution', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-command-timeout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'check.cjs'), "setTimeout(()=>console.log('finished'),250);");
  const passed = runToolchain(root, { test: { cmd: 'node check.cjs', timeoutMs: 5000 } }, { timeoutMs: 40 }).find(g => g.gate === 'test');
  assert.equal(passed.status, 'pass', JSON.stringify(passed)); assert.equal(passed.timeoutMs, 5000);
  assert.match(readFileSync(passed.stdoutPath, 'utf8'), /finished/);
  const stopped = runToolchain(root, { test: { cmd: 'node check.cjs', timeoutMs: 40 } }, { timeoutMs: 5000 }).find(g => g.gate === 'test');
  assert.equal(stopped.status, 'fail'); assert.equal(stopped.errorCode, 'ETIMEDOUT'); assert.equal(stopped.timeoutMs, 40);
  writeFileSync(join(root, 'check.cjs'), "console.log('default deadline');");
  const ordinary = runToolchain(root, { test: 'node check.cjs' }).find(g => g.gate === 'test');
  assert.equal(ordinary.status, 'pass'); assert.equal(ordinary.timeoutMs, 600000);
});

test('invalid or overflowing deadlines are refused instead of disabling cancellation', () => {
  for (const timeoutMs of [0, -1, 1.5, Infinity, NaN, 2147483648, '1000', true, null]) {
    assert.throws(() => normGate({ cmd: 'node check.cjs', timeoutMs }), /timeoutMs must be a positive integer/);
  }
  assert.deepEqual(normGate('node check.cjs'), { cmd: 'node check.cjs', when: 'task' });
  assert.deepEqual(normGate({ cmd: 'node check.cjs', when: 'phase', timeoutMs: 900000 }), { cmd: 'node check.cjs', when: 'phase', timeoutMs: 900000 });
});
