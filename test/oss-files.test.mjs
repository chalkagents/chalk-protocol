// OSS hygiene drift gate. An open-source repo's trust surface — license, contribution docs,
// feedback templates — must not silently regress, and the suite must never re-grow a dependency
// on the original author's personal remotes (it must pass on any stranger's machine).
// Locked contract for task-5223a19.
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('LICENSE exists at the root with the MIT text (package.json says MIT)', () => {
  assert.ok(existsSync(join(ROOT, 'LICENSE')), 'LICENSE file missing at repo root');
  const lic = read('LICENSE');
  assert.match(lic, /MIT License/);
  assert.match(lic, /Permission is hereby granted, free of charge/);
  assert.equal(JSON.parse(read('package.json')).license, 'MIT');
});

test('the suite carries no personal-remote fixtures — it must pass on a stranger clone', () => {
  const pipeline = read('test/pipeline.test.mjs');
  assert.ok(!pipeline.includes('github.com-devid'), 'pipeline test still hardcodes the author’s SSH host alias');
  assert.ok(!pipeline.includes('devid'), 'pipeline test still references the author’s personal account');
});

test('issue + PR templates exist, and the bug template asks for doctor output', () => {
  const tpl = (f) => join(ROOT, '.github', 'ISSUE_TEMPLATE', f);
  for (const f of ['bug_report.yml', 'friction_report.yml', 'feature_request.yml']) {
    assert.ok(existsSync(tpl(f)), `.github/ISSUE_TEMPLATE/${f} missing`);
  }
  assert.match(read('.github/ISSUE_TEMPLATE/bug_report.yml'), /chalk doctor/);
  assert.match(read('.github/ISSUE_TEMPLATE/friction_report.yml'), /stuck/i);
  assert.ok(existsSync(join(ROOT, '.github', 'PULL_REQUEST_TEMPLATE.md')), 'PR template missing');
});

test('community docs exist and CONTRIBUTING routes contributors through the chalk loop', () => {
  for (const f of ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) {
    assert.ok(existsSync(join(ROOT, f)), `${f} missing at repo root`);
  }
  const contributing = read('CONTRIBUTING.md');
  assert.match(contributing, /chalk (task add|next)/);
  assert.match(contributing, /node --test/);
});

test('README has a status & feedback section pointing at the friction template', () => {
  const readme = read('README.md');
  assert.match(readme, /## .*(Status|Feedback)/i);
  assert.match(readme, /friction/i);
});
