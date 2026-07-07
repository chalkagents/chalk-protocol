// Chalk Protocol — the test-enforcement gate. `verify` proves "nothing I assert is broken", never
// "this change is asserted" — so a feature can pass VACUOUSLY when the suite doesn't cover its new
// behavior (the live failure: a sort feature merged with no test, green all the way). P6 says you
// can't trust executor-written tests, so the first line of defense is to force one to EXIST: a
// feature change must add or change a test, else the work stage blocks. Shared by `chalk work`
// (the issue→merge pipeline) and `runDriver` (the local `chalk run` loop) so neither path can merge
// an untested feature. Zero dependencies beyond the spine.
import { changedPaths, gitTry } from './git.mjs';
import { workdir } from './store.mjs';

// Change types that legitimately ship no test of their own (docs, pure refactors with existing
// coverage, build/ci plumbing). Keyed on the task's branchType.
const TEST_EXEMPT = new Set(['docs', 'chore', 'refactor', 'style', 'build', 'ci']);

// A cross-language path heuristic for "this is a CODE test file": a test/spec naming convention AND a
// source-code extension — so a doc or data file under tests/ (tests/notes.md, foo-test.txt) can't
// satisfy the gate. This proves a test file EXISTS, not that it asserts the change — adequacy is the
// adversarial reviewer's job (lever 2), and "fails when the change is reverted" is a future mutation
// check (lever 3). The gate is lever 1: a feature can't merge with NO test at all.
const TEST_CODE_EXT = /\.(m?[jt]sx?|dart|py|go|rb|rs|java|kt|swift|scala|cs|php|exs?|cc?|cpp|h|hpp|m|mm)$/i;
const TEST_NAME = (p) =>
  /(^|\/)(tests?|specs?|__tests__)\//i.test(p) ||
  /[._-](test|spec)\.[a-z0-9]+$/i.test(p) ||
  /(^|\/)test_[^/]+\.[a-z0-9]+$/i.test(p);
export const looksLikeTest = (p) => TEST_CODE_EXT.test(p) && TEST_NAME(p);

// True when this task MUST ship a test but its change set has none — so a feature can't merge
// untested. Exempt: requireTest disabled, no acceptance criteria, a docs/chore/refactor branch, a
// `skip-test`/`no-test` label, or an already-locked acceptance test (the test exists, just not in
// this diff).
export function missingRequiredTest(store, task) {
  if (store.protocol().requireTest === false) return false;
  if (!((task.acceptanceCriteria || []).length)) return false;
  if (TEST_EXEMPT.has(task.branchType)) return false;
  if ((task.labels || []).some((l) => /^(skip|no)-test$/i.test(l))) return false;
  if ((task.tests || []).length) return false;
  const changes = changedPaths(workdir(store, task));
  // changedPaths reports UNCOMMITTED working-tree changes (git status). No detectable changes — the
  // executor wrote nothing, already committed, or this isn't a git tree — is NOT the test gate's
  // business: an empty diff is caught by verify / commit's "nothing to commit". Only block a real,
  // non-empty change set that ships no test. In the issue→merge pipeline `work` runs BEFORE `commit`
  // in a git worktree, so the executor's code change is always visible here (the gap that matters).
  return changes.length > 0 && !changes.some(looksLikeTest);
}

// A pinned path that legitimately lands OUT-OF-BAND — genuine spine STATE (tasks.json, boards,
// plans, …) that a feature-branch diff never carries — so gating it on git-tracking would be a
// false block. Everything under `.chalk/` EXCEPT e2e specs under `.chalk/tests/`: those are real
// contract tests that must be tracked like any other, and `chalk commit` stages them (#126 — the
// blanket `.chalk/` exemption re-opened the exact #107 vacuous-green hole for e2e specs).
export const spineStateExempt = (p) => p.startsWith('.chalk/') && !p.startsWith('.chalk/tests/');

// Locked tests that exist on disk but are NOT tracked by git (#107). The sha256 pin verifies
// against the working tree only, so an untracked pinned test passes every local gate while CI and
// any fresh checkout run WITHOUT the contract test — a vacuous green. Checked at `chalk done` and
// `chalk pr` (the manual-order flows the pipeline's commit stage doesn't sweep). Out-of-band spine
// STATE is exempt (see spineStateExempt); `.chalk/tests/` e2e specs are gated. In a non-git tree
// tracking is unverifiable, so nothing is reported — the other gates still apply.
// Normalize a repo-relative path for tracking comparison (#129): unify separators (Windows `\` →
// `/`), strip leading `./` segments and any trailing slash — these are all git-equivalent forms that
// must not false-block. On a case-insensitive filesystem (git's own `core.ignorecase`) also lowercase,
// so a case-only difference matches; on a case-sensitive FS the case is significant and preserved.
export function normTrackPath(p, ignoreCase = false) {
  const n = String(p).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  return ignoreCase ? n.toLowerCase() : n;
}

export function untrackedLockedTests(store, task) {
  const pinned = (task.tests || []).map((t) => t.path).filter((p) => p && !spineStateExempt(p));
  if (!pinned.length) return [];
  const wd = workdir(store, task);
  if (gitTry(wd, 'rev-parse --is-inside-work-tree') !== 'true') return [];
  // Compare NORMALIZED forms, not raw strings, so an equivalent pin (`./x`, `a\\b`, case-variant on
  // an ignorecase FS) isn't wrongly reported untracked — the gate must fire only on a GENUINELY
  // untracked file (#129), never regress the #107 vacuous-green guard.
  const ignoreCase = gitTry(wd, 'config --get core.ignorecase').trim() === 'true';
  const tracked = new Set(gitTry(wd, 'ls-files -z').split('\0').filter(Boolean).map((p) => normTrackPath(p, ignoreCase)));
  return pinned.filter((p) => !tracked.has(normTrackPath(p, ignoreCase)));
}
