// Post-run feedback nudge (#155). After a productive `chalk run`, chalk points the user at the
// zero-auth upstream channel `chalk feedback --submit` (#157) — closing the product loop right when
// the user has just felt the tool. The nudge must stay QUIET otherwise: silent on a no-op sweep and
// silent under the CHALK_NO_NUDGE opt-out, so it never nags. This suite pins the pure helper in every
// direction, and pins that `bin/chalk.mjs` actually wires it into the run summary (a helper that no
// call site invokes is a silent no-feature). Locked contract for the feedback-nudge task.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { feedbackNudge } from '../lib/feedback.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a productive run (merged > 0) nudges toward `chalk feedback --submit`', () => {
  const out = feedbackNudge({ merged: 1, blocked: 0, env: {} });
  assert.equal(typeof out, 'string');
  assert.match(out, /chalk feedback --submit/);
});

test('a run that only blocked still nudges (friction is worth reporting)', () => {
  assert.match(feedbackNudge({ merged: 0, blocked: 2, env: {} }), /chalk feedback --submit/);
});

test('a no-op sweep (nothing merged AND nothing blocked) is silent', () => {
  assert.equal(feedbackNudge({ merged: 0, blocked: 0, env: {} }), null);
});

test('CHALK_NO_NUDGE opts out even after a productive run', () => {
  assert.equal(feedbackNudge({ merged: 3, blocked: 1, env: { CHALK_NO_NUDGE: '1' } }), null);
});

test('the nudge advertises its own opt-out', () => {
  assert.match(feedbackNudge({ merged: 1, blocked: 0, env: {} }), /CHALK_NO_NUDGE/);
});

test('bin/chalk.mjs wires the nudge into the run summary', () => {
  // A pure helper that no call site invokes ships nothing. Guard the wiring from silent removal.
  const cli = readFileSync(join(repoRoot, 'bin/chalk.mjs'), 'utf8');
  assert.match(cli, /import\s*\{[^}]*\bfeedbackNudge\b[^}]*\}\s*from\s*['"]\.\.\/lib\/feedback\.mjs['"]/, 'must import feedbackNudge');
  assert.match(cli, /feedbackNudge\(\s*\{[^}]*merged:[^}]*blocked:[^}]*\}\s*\)/, 'must call feedbackNudge with the run totals');
});
