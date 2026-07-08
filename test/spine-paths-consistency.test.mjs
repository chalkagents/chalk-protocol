// Spine-state path unification (#131). The issue-intake commit (bin/chalk.mjs) and the reviewer's
// diff-exclude list (lib/review.mjs) must cover the SAME set of spine-state paths. When intake
// carried only a subset, a review-excluded path (e.g. `.chalk/chalk.json`, `.chalk/questions.json`)
// was left uncommitted by intake yet hidden from review — so it floated in the working tree and
// bundled into the next task branch, re-opening the scoped-diff leak #114 closed. Both now derive
// from the single SPINE_STATE_PATHS constant (store.mjs); this suite pins that they stay consistent
// so a future divergence (a re-hardcoded subset on either side) trips the suite. Locked contract
// for issue #131.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPINE_STATE_PATHS } from '../lib/store.mjs';
import { REVIEW_DIFF_EXCLUDES } from '../lib/review.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Unwrap a `':(exclude)<path>'` git pathspec back to its bare path.
const unwrapExclude = (spec) => {
  const m = /^':\(exclude\)(.*)'$/.exec(spec);
  assert.ok(m, `every reviewer exclude must be an :(exclude) pathspec, got: ${spec}`);
  return m[1];
};

test('the reviewer exclude list is exactly the shared spine-state set', () => {
  assert.deepEqual(
    REVIEW_DIFF_EXCLUDES.map(unwrapExclude),
    SPINE_STATE_PATHS,
    'REVIEW_DIFF_EXCLUDES must be SPINE_STATE_PATHS wrapped as :(exclude) pathspecs, in the same order',
  );
});

test('the intake commit derives its path set from SPINE_STATE_PATHS (no re-hardcoded subset)', () => {
  const src = readFileSync(join(ROOT, 'bin', 'chalk.mjs'), 'utf8');
  // The intake commit must filter SPINE_STATE_PATHS by existence — not a literal array. A literal
  // `.chalk/...` list here is exactly the subset drift #131 removes, so forbid one on the spineFiles line.
  const line = src.split('\n').find((l) => /const spineFiles\s*=/.test(l));
  assert.ok(line, 'the intake commit must build a spineFiles list');
  assert.match(line, /SPINE_STATE_PATHS/, 'spineFiles must derive from the shared SPINE_STATE_PATHS constant');
  assert.doesNotMatch(line, /'\.chalk\//, 'spineFiles must NOT re-hardcode `.chalk/` paths (that is the subset-drift #131 fixes)');
});

test('contract artifacts are NOT treated as spine state (they stay visible to review + committed as today)', () => {
  for (const artifact of ['.chalk/tests', '.chalk/evidence']) {
    assert.ok(
      !SPINE_STATE_PATHS.some((p) => p === artifact || p.startsWith(`${artifact}/`)),
      `${artifact} is a contract artifact and must NOT be in the spine-state exclude/commit set`,
    );
    assert.ok(
      !REVIEW_DIFF_EXCLUDES.map(unwrapExclude).some((p) => p === artifact || p.startsWith(`${artifact}/`)),
      `${artifact} must remain visible to the reviewer`,
    );
  }
});
