// Windows is a required platform, not a best-effort afterthought. This contract pins the CI lane,
// the complete suite command, platform-neutral executable discovery, and accountable exclusions.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandOnPath } from '../lib/doctor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('CI runs the complete suite on Ubuntu and Windows without changing cancellation semantics', () => {
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /os:\s*\[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /runs-on:\s*\$\{\{ matrix\.os \}\}/);
  assert.match(workflow, /node-version:\s*['"]20['"]/);
  assert.match(workflow, /- run:\s*node --test(?:\s|$)/m);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});

test('doctor executable discovery uses Node lookup rather than POSIX shell built-ins', () => {
  assert.equal(commandOnPath(process.execPath), true);
  assert.equal(commandOnPath('chalk-command-that-does-not-exist-056bac99'), false);
  assert.doesNotMatch(read('lib/doctor.mjs'), /command -v/);
});

test('Windows test exclusions must cite a tracked follow-up issue', () => {
  const tests = readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.test.mjs'));
  const issue = /https:\/\/github\.com\/chalkagents\/chalk-protocol\/issues\/\d+/;
  const windowsGuard = /process\.platform\s*(?:===|==)\s*['"]win32['"]/;
  for (const name of tests) {
    const source = read(`test/${name}`);
    if (windowsGuard.test(source)) {
      assert.match(source, issue, `${name} skips Windows without a tracked follow-up issue`);
    }
  }
});

test('README states the continuously verified platform boundary', () => {
  const readme = read('README.md');
  assert.match(readme, /complete `node --test` suite runs on both/);
  assert.match(readme, /`ubuntu-latest` and `windows-latest`/);
  assert.match(readme, /macOS is supported on a best-effort basis/);
});
