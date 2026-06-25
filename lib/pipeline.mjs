// Chalk Protocol — the unattended issue→merge driver. Walks each issue-backed task through the
// ordered pipeline stages by invoking the discrete `chalk` commands as subprocesses (so each
// stage's gate decides via its exit code, and a die() can't kill the whole run). Any non-zero
// stage blocks that task (needs:human-input) and the driver continues to the next issue — the
// gates are the safety, exactly as in `chalk run`. Resumable: each command no-ops/advances from
// task.pipeline.stage. Zero dependencies.
import { spawnSync } from 'node:child_process';

// Ordered stages. `review` is skipped when no reviewer is configured; `evidence` when no e2e.
const ORDER = ['branch', 'work', 'commit', 'pr', 'review', 'evidence', 'merge'];

function call(cliPath, cwd, args) {
  return spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf8' });
}

export function runPipeline(store, cliPath, { max = 20, dryRun = false, only = null, log = () => {} } = {}) {
  const proto = store.protocol();
  const queue = store.tasks().filter((t) => t.issue && t.state !== 'done' && t.state !== 'blocked' && (!only || t.id === only)).slice(0, max);
  if (dryRun) { for (const t of queue) log(`▶ #${t.issue.number} ${t.title}  ${ORDER.join(' → ')}`); return { dryRun: true, planned: queue.map((t) => t.id) }; }

  const merged = [], blocked = [];
  for (const t of queue) {
    const ref = t.id.slice(0, 12);
    log(`▶ #${t.issue.number} ${t.title}`);
    let ok = true;
    for (const cmd of ORDER) {
      if (cmd === 'review' && !proto.review?.command) { log('  review: skipped (no reviewer)'); continue; }
      if (cmd === 'evidence' && !proto.e2e?.command) { log('  evidence: skipped (no e2e)'); continue; }
      const r = call(cliPath, store.root, [cmd, ref]);
      log(`  ${cmd}: ${r.status === 0 ? 'ok' : `FAILED (exit ${r.status})`}`);
      if (r.status !== 0) {
        call(cliPath, store.root, ['block', ref, '--needs', 'human-input', '--reason', `pipeline stage '${cmd}' failed`]);
        blocked.push(t.id); ok = false; break;
      }
    }
    if (ok) merged.push(t.id);
  }
  return { merged, blocked, stopped: 'empty' };
}
