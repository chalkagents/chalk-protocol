// The `chalk issue pull` success line and the standing loop's parser of it are two halves of one
// contract (#: emitter/parser literal coupling). The loop decides "steady state — stop importing" in
// part on how many issues a round pulled; if a reword of the CLI line silently zeroes that count, the
// loop halts early and stops draining the backlog. This suite locks the shared contract: the parser
// round-trips the formatter, tolerates the CLI's bold-ANSI count and trailing "(N already tracked)"
// suffix, returns 0 only when truly absent, and — crucially — pins that BOTH sides route through
// lib/pull-count.mjs so the two literals can never drift apart again.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pulledIssuesLine, parsePulledIssues } from '../lib/pull-count.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parser round-trips the formatter for any count', () => {
  for (const n of [0, 1, 5, 42, 100]) {
    assert.equal(parsePulledIssues(pulledIssuesLine(n)), n);
  }
});

test('parser reads the count through the CLI bold-ANSI wrapping', () => {
  // Exactly what the CLI emits: bolded count + the dim "(N already tracked)" suffix.
  const line = `${pulledIssuesLine('\x1B[1m3\x1B[0m')} \x1B[2m(2 already tracked)\x1B[0m`;
  assert.equal(parsePulledIssues(line), 3);
});

test('parser returns 0 when no pull line is present', () => {
  assert.equal(parsePulledIssues('doctor: ok\nnothing to import here'), 0);
  assert.equal(parsePulledIssues(''), 0);
  assert.equal(parsePulledIssues(null), 0);
});

test('a number elsewhere cannot spoof the count', () => {
  assert.equal(parsePulledIssues('imported 7 tasks; pulled 2 new issue(s)'), 2);
  assert.equal(parsePulledIssues('42 open issues found'), 0);
});

test('both emitter and parser route through the shared module (no divergent literal)', () => {
  const cli = readFileSync(join(repoRoot, 'bin/chalk.mjs'), 'utf8');
  const loop = readFileSync(join(repoRoot, 'lib/loop.mjs'), 'utf8');
  assert.match(cli, /import\s*\{[^}]*\bpulledIssuesLine\b[^}]*\}\s*from\s*['"]\.\.\/lib\/pull-count\.mjs['"]/, 'CLI must import pulledIssuesLine');
  assert.match(cli, /pulledIssuesLine\(/, 'CLI must emit via pulledIssuesLine');
  assert.match(loop, /import\s*\{[^}]*\bparsePulledIssues\b[^}]*\}\s*from\s*['"]\.\/pull-count\.mjs['"]/, 'loop must import parsePulledIssues');
  assert.match(loop, /parsePulledIssues\(/, 'loop must parse via parsePulledIssues');
  // The old inline regex must be gone from the loop — otherwise the coupling silently persists.
  assert.doesNotMatch(loop, /match\(\/pulled\\s/, 'loop must not keep its own inline pulled-count regex');
});
