import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runAudit } from '../lib/regression.mjs';

test('phase verification honors the configured private-directory exclusion', t => {
  const root = mkdtempSync(join(tmpdir(), 'chalk-audit-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root });
  // Synthetic non-test data exercises the exclusion; no real held-out set is read or authored.
  mkdirSync(join(root, '.private-regression'));
  writeFileSync(join(root, '.private-regression/marker.txt'), 'before');
  writeFileSync(join(root, 'check.cjs'), 'require("fs").writeFileSync(".private-regression/marker.txt","after");');
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: { cmd: 'node check.cjs', when: 'phase' } };
  meta.protocol.regression.dir = '.private-regression'; store.saveMeta(meta);
  const result = runAudit(store), command = result.phaseGates.find(g => g.gate === 'test');
  assert.equal(command.status, 'pass');
  assert.deepEqual(command.inputChanges, []);
  assert.equal(command.monitorError, null);
});
