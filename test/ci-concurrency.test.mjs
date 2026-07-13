// CI concurrency policy. Without a concurrency group, redundant runs pile up (a PR branch that also
// pushes to main/dev triggers overlapping `test` runs) and — more dangerously — two release tags could
// publish concurrently. Both workflows must declare a concurrency group, with OPPOSITE cancel policies:
//   - test.yml  → cancel-in-progress: true  (a newer push makes the in-flight test run moot; save CI)
//   - release.yml → cancel-in-progress: false (NEVER cancel a publish mid-flight — a half-done
//     npm publish is worse than a queue). This suite locks both, and specifically guards that the
//     release workflow is not switched to cancel-in-progress: true. Structural, string-based assertions
//     — the project is zero-dependency, so there is no YAML parser to lean on.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wf = (name) => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  return readFileSync(join(root, '.github/workflows', name), 'utf8');
};

test('the test workflow cancels superseded runs', () => {
  const y = wf('test.yml');
  assert.match(y, /^concurrency:/m, 'test.yml must declare a top-level concurrency group');
  assert.match(y, /cancel-in-progress:\s*true/, 'test runs should cancel-in-progress');
});

test('the release workflow serializes but never cancels a publish', () => {
  const y = wf('release.yml');
  assert.match(y, /^concurrency:/m, 'release.yml must declare a top-level concurrency group');
  assert.match(y, /cancel-in-progress:\s*false/, 'release must NOT cancel an in-flight publish');
  assert.doesNotMatch(y, /cancel-in-progress:\s*true/, 'a publish must never be cancel-in-progress: true');
});
