import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../lib/store.mjs';
import { runAudit } from '../lib/regression.mjs';
import { auditCoverage } from '../lib/verification-coverage.mjs';
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'chalk-audit-observation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve('bin/chalk.mjs'), 'init', '--bare'], { cwd: root, stdio: 'ignore' });
  const store = new Store(root), meta = store.meta();
  meta.protocol.verify = { test: 'node -e "process.exit(0)"' };
  meta.protocol.regression = { command: 'node -e "process.exit(7)"', tests: [] }; store.saveMeta(meta);
  return { root, store, initial: meta };
}

test('audit observes configuration continuously across phase checks and regression preparation', t => {
  const { store, initial } = fixture(t), readMeta = store.meta.bind(store), readProtocol = store.protocol.bind(store);
  let selected = false, restored = false;
  store.meta = () => {
    const meta = readMeta();
    if (!selected && new Error().stack.split('\n')[2]?.includes('at runAudit')) {
      selected = true; meta.protocol.regression.command = 'node -e "process.exit(0)"'; store.saveMeta(meta);
    }
    return meta;
  };
  store.protocol = () => {
    const stack = new Error().stack;
    if (selected && !restored && (stack.split('\n')[2]?.includes('at observeApproval') || stack.includes('at finish'))) {
      restored = true; store.saveMeta(initial);
    }
    return readProtocol();
  };
  const result = runAudit(store);
  assert.equal(selected, true); assert.equal(restored, true);
  assert.equal(store.protocol().regression.command, initial.protocol.regression.command);
  assert.equal(result.phaseVerification.green, true, 'the temporary configuration is stable during phase verification alone');
  assert.equal(result.green, false, 'a passing command selected under temporary configuration cannot certify the restored failing command');
  assert.match(result.approvalError, /changed during audit/); assert.match(result.approvalError, /chalk audit/);
});

test('audit observation preflight failure reports no executed phase or regression checks', t => {
  const { root, store } = fixture(t);
  fs.symlinkSync('../outside.txt', join(root, 'outside-link'));
  const result = runAudit(store), coverage = auditCoverage(result);
  assert.equal(result.green, false); assert.equal(coverage.phase.executedChecks, 0);
  assert.equal(coverage.phase.integrity, 'not-established'); assert.equal(coverage.heldOut.executed, false);
  assert.equal(coverage.heldOut.status, 'not-executed'); assert.match(result.approvalError, /chalk audit/);
});

test('audit preflights split-index caches and recovers without changing staged source', t => {
  const { root, store } = fixture(t), meta = store.meta();
  meta.protocol.regression.command = 'node -e "process.exit(0)"'; store.saveMeta(meta);
  fs.writeFileSync(join(root, 'source.txt'), 'original');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.'); git('commit', '-qm', 'fixture');
  fs.writeFileSync(join(root, 'source.txt'), 'changed'); git('add', 'source.txt'); git('update-index', '--split-index');
  const staged = git('diff', '--cached');
  const refused = runAudit(store); assert.equal(refused.green, false); assert.equal(auditCoverage(refused).heldOut.executed, false);
  assert.match(refused.approvalError, /git update-index --no-split-index/); assert.match(refused.approvalError, /chalk audit/);
  git('update-index', '--no-split-index'); assert.equal(git('diff', '--cached'), staged);
  const renewed = runAudit(store); assert.equal(renewed.green, true, JSON.stringify(renewed));
});
