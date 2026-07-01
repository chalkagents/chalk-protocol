// Lever 3, the rigorous form — mutation testing as a test-ADEQUACY gate. `verify` proves "nothing I assert
// is broken", lever-1 (testgate) proves a test EXISTS, and the break-it lever proves a locked test fails
// when the WHOLE implementation is reverted. Mutation testing is the fine-grained generalization: it seeds
// many small faults into the CHANGED source and checks the tests KILL them. A SURVIVING mutant means the
// suite doesn't actually pin that behavior — a weak/vacuous assertion that line coverage can't see (a real
// benchmark test hit 100% coverage but a 4% mutation score; mutation score predicts fault detection where
// coverage doesn't, and Meta runs it in production).
//
// Opt-in like e2e/regression/break-it: it needs a per-file command template `protocol.mutation` because
// invoking a mutation tool on one file is language-specific — e.g. "npx stryker run --mutate {file}",
// "cargo mutants --file {file}", "mutmut run --paths-to-mutate {file}". The command MUST exit non-zero when
// mutants survive (Stryker's --break-at threshold and cargo-mutants both do). Empty/unset → the gate is OFF.
// Zero dependencies beyond the spine.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { withRunner } from './config.mjs';
import { changedPaths } from './git.mjs';
import { looksLikeTest } from './testgate.mjs';
import { workdir } from './store.mjs';

// Pure decision: which changed source files have SURVIVING mutants. `runsCleanOnFile(path)` → true when the
// per-file mutation command exits 0 (all mutants killed / score over threshold). The survivors are exactly
// the files where it does not. Mirrors evaluateBreakit so the two non-vacuity levers read alike.
export function evaluateMutation({ files, runsCleanOnFile }) {
  const checked = files || [];
  return { checked, survived: checked.filter((p) => !runsCleanOnFile(p)) };
}

// Run the mutation probe for a task: mutate each CHANGED implementation file (a changed path that is not a
// test and not the spine, present on disk) and flag any with surviving mutants. Skips (never blocks) when it
// can't form a real probe: no command configured, or no implementation change to mutate. Returns
// { skipped, reason?, checked, survived }.
export function runMutation(store, task, { cwd = workdir(store, task) } = {}) {
  const tmpl = store.protocol().mutation;
  if (!tmpl) return { skipped: true, reason: 'mutation not configured', checked: [], survived: [] };
  const runner = store.protocol().runner;

  // The changed implementation: changed paths that are NOT tests and NOT the spine, that exist on disk.
  // Excluding `.chalk/` matters in the primary root (`chalk run`) where the spine mutates constantly and is
  // never the code under test; a deleted file can't be mutated, so it's filtered too.
  const impl = changedPaths(cwd).filter((p) => !looksLikeTest(p) && !p.startsWith('.chalk/') && existsSync(join(cwd, p)));
  if (!impl.length) return { skipped: true, reason: 'no implementation change to mutate', checked: [], survived: [] };

  // A clean non-zero exit from a tool that actually RAN = surviving mutants = the tests don't pin this
  // change. But a tool that couldn't run — missing binary (shell exit 127), a timeout, or a kill — must NOT
  // masquerade as "weak tests" and false-block real work, so it's treated as inconclusive (clean). Mutation
  // runs the suite once per mutant, so it's slow — a generous timeout (it gates `work`/`done`, not `verify`).
  const runsCleanOnFile = (p) => {
    try { execSync(withRunner(runner, tmpl.replace('{file}', p)), { cwd, stdio: 'pipe', timeout: 20 * 60 * 1000 }); return true; }
    catch (e) {
      if (e.status === 127 || e.code === 'ENOENT' || e.code === 'ETIMEDOUT' || e.killed || e.signal) return true;
      return false; // the tool ran and reported surviving mutants
    }
  };
  return { skipped: false, ...evaluateMutation({ files: impl, runsCleanOnFile }) };
}
