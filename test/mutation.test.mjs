// M2 — mutation testing as a test-ADEQUACY gate (the rigorous form of lever 3). The break-it lever proves a
// locked test fails when the WHOLE implementation is reverted; mutation testing is the fine-grained
// generalization: it seeds many small faults into the CHANGED source and checks the tests KILL them.
// Surviving mutants = the tests don't actually pin the behavior — a weakness coverage can't see (a real
// benchmark test hit 100% coverage but a 4% mutation score; Meta runs this in production). Opt-in like
// breakTest/e2e: needs a per-file command template `protocol.mutation` that EXITS NON-ZERO when mutants
// survive (Stryker --break-at, cargo-mutants). These cover the pure decision, the opt-in switch, the
// implementation-file filter, {file} substitution, and not false-blocking when the tool can't run.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { evaluateMutation, runMutation } from '../lib/mutation.mjs';

test('evaluateMutation — survivors are exactly the changed files whose mutants are not all killed', () => {
  const r = evaluateMutation({
    files: ['a.mjs', 'b.mjs', 'c.mjs'],
    runsCleanOnFile: (p) => p !== 'b.mjs', // b has surviving mutants (command exits non-zero)
  });
  assert.deepEqual(r.checked, ['a.mjs', 'b.mjs', 'c.mjs']);
  assert.deepEqual(r.survived, ['b.mjs'], 'only the file with surviving mutants is flagged');
});

test('runMutation — OFF unless protocol.mutation is configured (opt-in like break-it/e2e)', () => {
  const store = { protocol: () => ({ mutation: '' }) };
  const r = runMutation(store, { tests: [] }, { cwd: '/nonexistent' });
  assert.equal(r.skipped, true, 'empty mutation template → skipped');
  assert.deepEqual(r.survived, [], 'a skipped gate flags nothing');
});

// --- real-git integration: detect the changed impl file and flag it by the command's exit code. The
// mutation tool is stubbed by a node one-liner (real tools like Stryker aren't zero-dep), exactly as we'd
// shell out to one — it proves {file} substitution + changed-file detection + exit-code → survivor mapping.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'mutation-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 1;\n');
  g('add -A'); g('commit -m base');
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 2;\n'); // a real working-tree impl change
  return { d, g };
}

test('runMutation — flags a changed file whose mutation command reports survivors, and substitutes {file}', () => {
  const { d } = repo();
  // The stub exits 1 (survivors) ONLY when {file} was substituted with the changed path — proving both the
  // exit-code → survivor mapping AND that {file} is replaced (a literal "{file}" would not endWith feature.mjs).
  const store = { protocol: () => ({ mutation: `node -e "process.exit('{file}'.endsWith('feature.mjs') ? 1 : 0)"` }) };
  const r = runMutation(store, { tests: [] }, { cwd: d });
  assert.equal(r.skipped, false, 'configured + a changed impl file → the gate runs');
  assert.deepEqual(r.survived, ['feature.mjs'], 'a file with surviving mutants is flagged (and {file} was substituted)');
});

test('runMutation — a changed file whose mutants are all killed (exit 0) is NOT flagged', () => {
  const { d } = repo();
  const store = { protocol: () => ({ mutation: `node -e "process.exit(require('fs').existsSync('{file}') ? 0 : 1)"` }) };
  const r = runMutation(store, { tests: [] }, { cwd: d });
  assert.equal(r.skipped, false);
  assert.deepEqual(r.survived, [], 'all mutants killed → not flagged');
});

test('runMutation — mutates ONLY changed implementation files (excludes tests and the spine)', () => {
  const d = mkdtempSync(join(tmpdir(), 'mutation-filter-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  mkdirSync(join(d, 'test'), { recursive: true });
  mkdirSync(join(d, '.chalk'), { recursive: true });
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 1;\n');
  writeFileSync(join(d, 'test/feature.test.mjs'), '// base\n');
  writeFileSync(join(d, '.chalk/notes.md'), 'base\n');
  g('add -A'); g('commit -m base');
  // Change all three: an implementation file, a TEST file, and a spine (.chalk) file.
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 2;\n');
  writeFileSync(join(d, 'test/feature.test.mjs'), '// changed\n');
  writeFileSync(join(d, '.chalk/notes.md'), 'changed\n');
  // Every CHECKED file is reported as a survivor (exit 1), so `checked`/`survived` reveal exactly what was mutated.
  const store = { protocol: () => ({ mutation: 'node -e "process.exit(1)"' }) };
  const r = runMutation(store, { tests: [] }, { cwd: d });
  assert.deepEqual(r.checked, ['feature.mjs'], 'only the changed implementation file is mutated — not the test or the spine');
  assert.deepEqual(r.survived, ['feature.mjs']);
});

test('runMutation — a tool that cannot RUN (missing binary) is inconclusive, never a false survivor', () => {
  const { d } = repo();
  const store = { protocol: () => ({ mutation: 'definitely-not-a-real-binary-xyz123 {file}' }) };
  const r = runMutation(store, { tests: [] }, { cwd: d });
  assert.equal(r.skipped, false, 'a changed impl file is present, so the probe runs');
  assert.deepEqual(r.survived, [], 'a missing mutation tool must not masquerade as weak tests and block real work');
});

test('runMutation — skips (never blocks) when there is no implementation change to mutate', () => {
  const d = mkdtempSync(join(tmpdir(), 'mutation-empty-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  const store = { protocol: () => ({ mutation: 'node -e "process.exit(1)"' }) };
  const r = runMutation(store, { tests: [] }, { cwd: d });
  assert.equal(r.skipped, true, 'no changed impl file → skip rather than falsely block');
});
