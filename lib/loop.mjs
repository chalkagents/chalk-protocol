// Chalk Protocol — the bounded STANDING loop. `chalk autopilot` is one safe sweep; this drives
// several rounds so the loop self-drives to a terminus instead of being hand-kicked. Each round:
// (1) pull newly-filed issues (incl. the retro's own self-heal issues) into the backlog, (2) run one
// autopilot sweep, (3) read the convergence marker the retro wrote. It STOPS — it never runs away —
// when any of: the round reached steady state (nothing pulled AND nothing merged), the sweep was
// skipped/not-ready (locked or doctor-failed), or the round cap is hit. The convergence guard
// (retro severity floor) is what makes "steady state" reachable: the retro defers cosmetic nits, so
// rounds stop producing new above-floor work. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAutopilot } from './autopilot.mjs';
import { parsePulledIssues } from './pull-count.mjs';

// Pull open issues into the backlog by invoking the real `chalk issue pull`; return how many were new.
// The count phrasing + its parser are the one shared contract in pull-count.mjs (parsePulledIssues
// strips ANSI itself), so a reword of the CLI's success line can't silently zero this.
function pullIssues(cliPath, root) {
  const r = spawnSync('node', [cliPath, 'issue', 'pull'], { cwd: root, encoding: 'utf8' });
  return parsePulledIssues(`${r.stdout || ''}${r.stderr || ''}`);
}

// Read the convergence marker the last retro wrote (best-effort).
function lastConverged(root) {
  try { return JSON.parse(readFileSync(join(root, '.chalk', 'local', 'retro-last.json'), 'utf8')).converged === true; }
  catch { return false; }
}

export function runLoop(store, cliPath, { maxRounds = 5, max = 3, minSeverity = 'med', pull = pullIssues, log = () => {} } = {}) {
  const rounds = [];
  for (let i = 1; i <= maxRounds; i++) {
    const pulled = pull(cliPath, store.root);
    const r = runAutopilot(store, cliPath, { max, minSeverity, log: (m) => log('  ' + m) });
    if (r.skipped || r.notReady) {
      rounds.push({ round: i, pulled, merged: 0, blocked: 0, stopped: r.skipped ? 'locked' : 'not-ready' });
      log(`round ${i}: ${r.skipped ? 'skipped (locked)' : 'not ready'} — stopping`);
      break;
    }
    const merged = (r.merged || []).length;
    const blocked = (r.blocked || []).length;
    const converged = lastConverged(store.root);
    rounds.push({ round: i, pulled, merged, blocked, converged });
    log(`round ${i}: pulled ${pulled}, merged ${merged}, blocked ${blocked}${converged ? ', retro converged' : ''}`);
    // Steady state: a round that imported nothing new AND merged nothing has no more work to do.
    if (pulled === 0 && merged === 0) { log(`steady state after ${i} round(s) — done`); break; }
  }
  const totalMerged = rounds.reduce((a, r) => a + (r.merged || 0), 0);
  const totalBlocked = rounds.reduce((a, r) => a + (r.blocked || 0), 0);
  return { rounds, totalMerged, totalBlocked };
}
