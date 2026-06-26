// Chalk Protocol — the test-enforcement gate. `verify` proves "nothing I assert is broken", never
// "this change is asserted" — so a feature can pass VACUOUSLY when the suite doesn't cover its new
// behavior (the live failure: a sort feature merged with no test, green all the way). P6 says you
// can't trust executor-written tests, so the first line of defense is to force one to EXIST: a
// feature change must add or change a test, else the work stage blocks. Shared by `chalk work`
// (the issue→merge pipeline) and `runDriver` (the local `chalk run` loop) so neither path can merge
// an untested feature. Zero dependencies beyond the spine.
import { changedPaths } from './git.mjs';
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
