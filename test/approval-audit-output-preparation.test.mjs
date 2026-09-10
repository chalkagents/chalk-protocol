import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runAudit } from '../lib/regression.mjs';

for (const runsDir of ['.chalk/runs', '.chalk/browser/output']) test(`first audit prepares browser output before observing inputs (${runsDir})`, t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-audit-outputs-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  fs.writeFileSync(join(root, 'visible.test.yaml'), 'id: visible\nsteps: []\n');
  fs.writeFileSync(join(root, 'browser.cjs'), 'console.log("browser executed");');
  const store = new Store(root), meta = store.meta(); meta.protocol.verify = { test: 'node -e "process.exit(0)"' };
  meta.protocol.e2e = { ...meta.protocol.e2e, command: 'node browser.cjs', runsDir }; store.saveMeta(meta);
  store.upsertTask({ id: 'task-browser', title: 'browser contract', state: 'in-progress', acceptanceCriteria: [{ text: 'visible requirement' }], tests: [store.lockTest(join(root, 'visible.test.yaml'))] });
  assert.equal(fs.existsSync(join(root, '.chalk/tests')), false); assert.equal(fs.existsSync(join(root, runsDir)), false);
  const first = runAudit(store); assert.equal(first.phaseVerification.e2e.length, 1); assert.equal(first.phaseVerification.e2eGreen, true);
  assert.equal(first.green, true, JSON.stringify(first));
  assert.equal(runAudit(store).green, true, 'an unchanged second audit remains green');
});
