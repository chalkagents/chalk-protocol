// The adversarial reviewer grades a captured diff of the change under review. captureDiff tries an
// ordered list of `git diff` strategies and takes the first non-empty one. The base-relative pair must
// prefer the REMOTE-tracking ref (origin/<base>) over the local branch: origin/<base> is what the PR
// actually diffs against, whereas a local <base> is routinely stale or divergent. A rebased local `dev`
// has its merge-base with the feature branch far back at the trunk, so `git diff <base>...HEAD` balloons
// to the ENTIRE base-vs-trunk history — flooding the reviewer with dozens of unrelated files and burying
// the real change (this produced spurious "scope bloat" findings on every dev-based PR). This suite
// locks the strategy order: working tree first, then remote base BEFORE local base, then the
// branchless fallbacks — so the reviewer sees the scoped change, not the whole branch history.
import { test } from 'node:test';
import assert from 'node:assert';
import { diffStrategies } from '../lib/review.mjs';

test('the remote base is tried before the local base', () => {
  const cmds = diffStrategies('dev');
  const remote = cmds.indexOf('git diff origin/dev...HEAD');
  const local = cmds.indexOf('git diff dev...HEAD');
  assert.ok(remote !== -1, 'must try the remote-tracking base origin/dev');
  assert.ok(local !== -1, 'must still fall back to the local base');
  assert.ok(remote < local, `origin/dev...HEAD (${remote}) must come before dev...HEAD (${local})`);
});

test('working-tree changes are checked first, base-relative diffs after', () => {
  const cmds = diffStrategies('main');
  assert.equal(cmds[0], 'git diff HEAD', 'uncommitted work is the first strategy');
  assert.ok(cmds.indexOf('git diff origin/main...HEAD') > 0);
});

test('branchless fallbacks are present and last (single-branch / committed-to-main / demo)', () => {
  const cmds = diffStrategies('dev', 'EMPTY');
  assert.ok(cmds.includes('git diff HEAD~1 HEAD'), 'last-commit fallback');
  assert.ok(cmds.includes('git diff EMPTY HEAD'), 'empty-tree fallback (first commit, no parent)');
  // Both base-relative strategies must precede the branchless fallbacks, so a real branch delta wins.
  const lastBaseRel = Math.max(cmds.indexOf('git diff origin/dev...HEAD'), cmds.indexOf('git diff dev...HEAD'));
  assert.ok(lastBaseRel < cmds.indexOf('git diff HEAD~1 HEAD'), 'base-relative diffs come before the fallbacks');
});

test('with no base, only working-tree + branchless strategies are offered', () => {
  const cmds = diffStrategies('');
  assert.ok(!cmds.some((c) => c.includes('...HEAD')), 'no base-relative diff when there is no base');
  assert.equal(cmds[0], 'git diff HEAD');
});
