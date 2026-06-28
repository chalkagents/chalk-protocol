// Chalk Protocol — Lever 3: the "break-it" / non-vacuity gate. Lever 1 (testgate) forces a test to
// EXIST and Lever 2 (the adversarial reviewer) judges adequacy, but neither proves the locked test
// actually ASSERTS the change. The live failure this closes: a sort feature merged with a test that
// passed whether or not the sort was correct. This gate reverts the implementation and runs the
// locked test against pre-change code — a test that stays GREEN there is vacuous (asserts nothing
// about the feature) and blocks. The strongest cheap proof a test is real: it fails without the code.
//
// Opt-in, like e2e/regression: it needs a per-file test command template `protocol.breakTest` (e.g.
// "node --test {test}", "pytest {test}", "flutter test {test}") because running ONE test file is
// language-specific. Empty/unset → the gate is OFF. Zero dependencies beyond the spine.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { withRunner } from './config.mjs';
import { changedPaths } from './git.mjs';
import { looksLikeTest } from './testgate.mjs';
import { workdir } from './store.mjs';

// Pure decision: the vacuous tests are exactly those that still pass against the reverted base.
// `runsGreenOnBase(path)` → true when the test passes with the implementation change removed.
export function evaluateBreakit({ tests, runsGreenOnBase }) {
  const checked = tests || [];
  return { checked, vacuous: checked.filter((p) => runsGreenOnBase(p)) };
}

// Run the break-it probe for a task. Reverts the implementation (changed NON-test paths) to base,
// keeping the locked tests in place, runs each locked CODE test, and flags any that still pass.
// The revert is a `git stash` that is ALWAYS popped (finally), so the impl change survives the check.
// Returns { skipped, reason?, checked, vacuous }. Skips (never blocks) when it can't form a real
// probe: no command configured, no locked code test on disk, or nothing to revert.
export function runBreakit(store, task, { cwd = workdir(store, task) } = {}) {
  const tmpl = store.protocol().breakTest;
  if (!tmpl) return { skipped: true, reason: 'breakTest not configured', checked: [], vacuous: [] };
  const runner = store.protocol().runner;

  const tests = (task.tests || []).map((t) => t.path).filter((p) => looksLikeTest(p) && existsSync(join(cwd, p)));
  if (!tests.length) return { skipped: true, reason: 'no locked code test to probe', checked: [], vacuous: [] };

  // Revert only the implementation — the changed paths that are NOT tests and NOT the spine — so each
  // locked test runs against pre-change code while the test file itself stays put. Excluding `.chalk/`
  // matters when work runs in the PRIMARY root (e.g. `chalk run`): the spine is mutated constantly and
  // is never the code under test, so it must not be stashed. With no impl change there's nothing to
  // break, so the probe is meaningless: skip rather than falsely clear or block.
  const impl = changedPaths(cwd).filter((p) => !looksLikeTest(p) && !p.startsWith('.chalk/'));
  if (!impl.length) return { skipped: true, reason: 'no implementation change to revert', checked: tests, vacuous: [] };

  const sh = (c) => execSync(c, { cwd, stdio: 'pipe', encoding: 'utf8' });
  // The probe runs the test command as a clean child. Strip NODE_TEST_CONTEXT so a `node --test`
  // probe spawned from inside another test run executes standalone — otherwise the child reports to
  // the parent harness and its failure wouldn't surface as a non-zero exit (the verdict we read).
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  let stashed = false;
  try {
    sh(`git stash push --include-untracked -- ${impl.map((p) => JSON.stringify(p)).join(' ')}`);
    stashed = true;
    const runsGreenOnBase = (p) => {
      try { execSync(withRunner(runner, tmpl.replace('{test}', p)), { cwd, stdio: 'pipe', env, timeout: 10 * 60 * 1000 }); return true; }
      catch { return false; } // non-zero exit = the test FAILS on base = it asserts the change = good
    };
    return { skipped: false, ...evaluateBreakit({ tests, runsGreenOnBase }) };
  } finally {
    // Always restore the implementation. If pop fails the impl is left in the stash — verify will go
    // RED and surface it rather than silently dropping the agent's work.
    if (stashed) { try { sh('git stash pop'); } catch { /* surfaced downstream by a now-RED verify */ } }
  }
}
