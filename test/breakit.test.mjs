// Lever 3 — the "break-it" / non-vacuity gate. `verify` proves "nothing I assert is broken" and the
// lever-1 testgate proves a test EXISTS, but neither proves the locked test actually ASSERTS the
// change. This gate reverts the implementation and runs the locked test against pre-change code: a
// test that stays green there is vacuous (it would pass with or without the feature). These tests
// cover the pure decision, the opt-in switch, the real revert/restore mechanics, and that a genuine
// asserting test is NOT flagged.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { evaluateBreakit, runBreakit } from '../lib/breakit.mjs';

test('evaluateBreakit — vacuous tests are exactly the ones that stay green on the reverted base', () => {
  const r = evaluateBreakit({
    tests: ['a.test.js', 'b.test.js', 'c.test.js'],
    runsGreenOnBase: (p) => p === 'b.test.js', // b passes against base → asserts nothing → vacuous
  });
  assert.deepEqual(r.checked, ['a.test.js', 'b.test.js', 'c.test.js']);
  assert.deepEqual(r.vacuous, ['b.test.js']);
});

test('runBreakit — OFF unless protocol.breakTest is configured (opt-in like e2e/regression)', () => {
  const store = { protocol: () => ({ breakTest: '' }) };
  const task = { tests: [{ path: 'test/x.test.js' }] };
  const r = runBreakit(store, task, { cwd: '/nonexistent' });
  assert.equal(r.skipped, true, 'empty breakTest → skipped');
  assert.deepEqual(r.vacuous, [], 'a skipped gate flags nothing');
});

// --- real-git integration: revert the impl, run the locked test against base, restore. ---
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'breakit-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  // Base commit: the feature returns 0.
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 0;\n');
  g('add -A'); g('commit -m base');
  // Working-tree change: the feature now returns 1 (the "implementation" under test).
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 1;\n');
  mkdirSync(join(d, 'test'), { recursive: true });
  return { d };
}

const store = { protocol: () => ({ breakTest: 'node --test {test}' }) };

test('runBreakit — a test that asserts the change FAILS on the reverted base → NOT vacuous', () => {
  const { d } = repo();
  // Asserts the NEW behavior (f() === 1). Against the reverted base (f() === 0) it must fail.
  writeFileSync(join(d, 'test/feat.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert'; import { f } from '../feature.mjs';\n` +
    `test('returns 1', () => assert.equal(f(), 1));\n`);
  const task = { tests: [{ path: 'test/feat.test.mjs' }] };

  const r = runBreakit(store, task, { cwd: d });
  assert.equal(r.skipped, false, 'configured + a locked code test → the gate runs');
  assert.deepEqual(r.vacuous, [], 'a genuine asserting test is not flagged');
  // The working tree is restored: the implementation change survives the check.
  assert.match(readFileSync(join(d, 'feature.mjs'), 'utf8'), /=> 1/, 'impl restored after the probe');
});

test('runBreakit — a test that passes regardless PASSES on the reverted base → vacuous (flagged)', () => {
  const { d } = repo();
  // Asserts nothing about the feature — green with or without the change.
  writeFileSync(join(d, 'test/vac.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert';\n` +
    `test('trivially true', () => assert.equal(1, 1));\n`);
  const task = { tests: [{ path: 'test/vac.test.mjs' }] };

  const r = runBreakit(store, task, { cwd: d });
  assert.equal(r.skipped, false);
  assert.deepEqual(r.vacuous, ['test/vac.test.mjs'], 'a vacuous locked test is flagged');
  assert.match(readFileSync(join(d, 'feature.mjs'), 'utf8'), /=> 1/, 'impl restored even when flagged');
});
