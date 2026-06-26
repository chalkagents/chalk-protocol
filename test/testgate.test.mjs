// Unit tests for the test-enforcement gate's own logic — the regex heuristic and the exemption /
// non-empty-diff rules. (The gate's end-to-end behavior — work blocks a code-only feature, a test
// satisfies it, docs/skip-test/requireTest=false are exempt — is covered in pipeline.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { looksLikeTest, missingRequiredTest } from '../lib/testgate.mjs';

test('looksLikeTest — matches CODE test files across languages, not docs/data under tests/', () => {
  for (const p of [
    'test/foo_test.dart', 'lib/foo.test.js', 'src/foo.spec.ts', 'pkg/foo_test.go',
    'tests/test_foo.py', 'a/b/x.test.jsx', 'spec/thing_spec.rb', 'test/Widget.test.tsx',
  ]) assert.ok(looksLikeTest(p), `should match: ${p}`);

  for (const p of [
    'tests/notes.md', 'docs/test.txt', 'foo-test.txt', 'feature.js', 'lib/util.dart',
    'test-data.json', 'README.md', 'tests/fixtures/data.csv', 'spec/openapi.yaml',
  ]) assert.ok(!looksLikeTest(p), `should NOT match: ${p}`);
});

test('missingRequiredTest — exemptions, the locked-test shortcut, and the non-empty-diff rule', () => {
  const d = mkdtempSync(join(tmpdir(), 'tg-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  const store = (requireTest = true) => ({ root: d, protocol: () => ({ requireTest }) });
  const feat = { acceptanceCriteria: [{ text: 'x' }], branchType: 'feat', labels: [], tests: [] };

  // empty diff (executor wrote nothing) → NOT the gate's business.
  assert.equal(missingRequiredTest(store(), feat), false, 'empty diff → not blocked');

  // a code-only change with no test → missing.
  writeFileSync(join(d, 'feature.js'), 'export const f = 1;\n');
  assert.equal(missingRequiredTest(store(), feat), true, 'code-only feature change → missing test');

  // exemptions all short-circuit before the diff check.
  assert.equal(missingRequiredTest(store(false), feat), false, 'requireTest=false → off');
  assert.equal(missingRequiredTest(store(), { ...feat, branchType: 'docs' }), false, 'docs branch → exempt');
  assert.equal(missingRequiredTest(store(), { ...feat, branchType: 'refactor' }), false, 'refactor → exempt');
  assert.equal(missingRequiredTest(store(), { ...feat, labels: ['skip-test'] }), false, 'skip-test label → exempt');
  assert.equal(missingRequiredTest(store(), { ...feat, tests: [{ path: 't' }] }), false, 'a locked test → satisfied');
  assert.equal(missingRequiredTest(store(), { ...feat, acceptanceCriteria: [] }), false, 'no criteria → not a gated task');

  // add a real code test file to the diff → satisfied.
  writeFileSync(join(d, 'feature.test.js'), '// asserts feature\n');
  assert.equal(missingRequiredTest(store(), feat), false, 'a code test in the diff → satisfied');

  // a test inside a BRAND-NEW directory must be seen individually (not collapsed to `test/`), so it
  // satisfies the gate rather than false-blocking.
  const d3 = mkdtempSync(join(tmpdir(), 'tg3-'));
  execSync('git init -b main', { cwd: d3, stdio: 'pipe' });
  writeFileSync(join(d3, 'feature.js'), 'x');
  execSync('mkdir -p test', { cwd: d3 });
  writeFileSync(join(d3, 'test/feature_test.dart'), '// asserts');
  assert.equal(missingRequiredTest({ root: d3, protocol: () => ({ requireTest: true }) }, feat), false, 'a test in a new dir satisfies the gate (no false-block)');

  // a junk file that merely lives under tests/ does NOT satisfy the gate.
  const d2 = mkdtempSync(join(tmpdir(), 'tg2-'));
  execSync('git init -b main', { cwd: d2, stdio: 'pipe' });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d2, stdio: 'pipe' });
  writeFileSync(join(d2, 'feature.js'), 'x');
  execSync('mkdir -p tests', { cwd: d2 });
  writeFileSync(join(d2, 'tests/notes.md'), 'not a test');
  assert.equal(missingRequiredTest({ root: d2, protocol: () => ({ requireTest: true }) }, feat), true, 'a doc under tests/ does NOT satisfy the gate');
});
