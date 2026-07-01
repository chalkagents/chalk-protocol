// Chalk Protocol — the unattended issue→merge driver. Walks each issue-backed task through the
// ordered pipeline stages by invoking the discrete `chalk` commands as subprocesses (so each
// stage's gate decides via its exit code, and a die() can't kill the whole run). Any non-zero
// stage blocks that task (needs:human-input) and the driver continues to the next issue — the
// gates are the safety, exactly as in `chalk run`. Resumable: each command no-ops/advances from
// task.pipeline.stage. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { reviewFixLoop } from './reviewloop.mjs';

// Ordered stages. `review` is skipped when no reviewer is configured; `evidence` when no e2e.
const ORDER = ['branch', 'plan', 'work', 'commit', 'pr', 'review', 'evidence', 'merge'];

function call(cliPath, cwd, args) {
  return spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf8' });
}

// A failed stage's stdout/stderr is the only evidence of WHY it died (e.g. "nothing to commit").
// Discarding it leaves the auto-block undiagnosable. Build a trimmed, bounded tail of the captured
// output so it can be folded into the block reason and the sweep transcript. Returns '' when empty.
function stageSnippet(r, max = 600) {
  const raw = (r?.stderr || r?.stdout || '').trim();
  if (!raw) return '';
  const collapsed = raw.replace(/\s*\n\s*/g, ' ').trim();
  return collapsed.length > max ? `…${collapsed.slice(-max)}` : collapsed;
}

// Build a block reason from the reviewer's latest persisted verdict (task.reviews), so a failed
// review surfaces the blocking finding text rather than the generic "stage failed". Falls back to
// a clear message when the reviewer errored without producing a verdict/finding — enriched with the
// failed reviewer subprocess's own output so a reviewer crash is still diagnosable.
function reviewBlockReason(store, ref, r) {
  const t = store.task(ref);
  const last = (t?.reviews || []).slice(-1)[0];
  const findings = (last && Array.isArray(last.findings)) ? last.findings : [];
  if (findings.length) {
    const text = findings.map((f) => `[${f.severity || '?'}/${f.area || '?'}] ${f.note || ''}`.trim()).join('; ');
    return `review blocked: ${text}`;
  }
  const snip = stageSnippet(r);
  return `review error (no verdict) after retry — reviewer did not return a blocking finding${snip ? `: ${snip}` : ''}`;
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
      if (cmd === 'plan' && !proto.planner?.command) { log('  plan: skipped (no planner)'); continue; }
      if (cmd === 'review' && !proto.review?.command) { log('  review: skipped (no reviewer)'); continue; }
      if (cmd === 'evidence' && !proto.e2e?.command) { log('  evidence: skipped (no e2e)'); continue; }
      let r = call(cliPath, store.root, cmd === 'review' ? [cmd, ref, '--no-retry'] : [cmd, ref]);
      log(`  ${cmd}: ${r.status === 0 ? 'ok' : `FAILED (exit ${r.status})`}`);
      // The review stage is special: a non-zero exit may be a transient/non-deterministic
      // reviewer failure rather than genuine human-input, and the block reason must surface the
      // reviewer's actual blocking finding (not the generic "stage failed"). So retry ONCE before
      // auto-blocking, and build the reason from the persisted review record (task.reviews).
      if (cmd === 'review' && r.status === 3) {
        // A genuine BLOCK (findings), not a transient error: enter the fix → re-verify → re-review
        // loop. The executor sees the findings via buildContext; bounded by the churn budget. On
        // exhaustion, `chalk block` parks it (needs:human-input) AND writes a handoff with the findings.
        const maxRounds = store.protocol().handoff?.maxAttempts ?? 3;
        log(`  review: BLOCK — entering fix→re-review loop (≤${maxRounds} rounds)`);
        const res = reviewFixLoop({ store, ref, call, cliPath, maxRounds });
        if (!res.passed) {
          call(cliPath, store.root, ['block', ref, '--needs', 'human-input', '--reason', reviewBlockReason(store, ref, r)]);
          blocked.push(t.id); ok = false; break;
        }
        log(`  review: PASSED after ${res.rounds} fix round(s)`);
      } else if (cmd === 'review' && r.status !== 0) {
        log('  review: retrying once (transient/non-deterministic failure?)');
        r = call(cliPath, store.root, [cmd, ref, '--no-retry']);
        log(`  review (retry): ${r.status === 0 ? 'ok' : `FAILED (exit ${r.status})`}`);
        if (r.status !== 0) {
          const snip = stageSnippet(r);
          if (snip) log(`  ${cmd}: output → ${snip}`);
          call(cliPath, store.root, ['block', ref, '--needs', 'human-input', '--reason', reviewBlockReason(store, ref, r)]);
          blocked.push(t.id); ok = false; break;
        }
      } else if (r.status !== 0) {
        const snip = stageSnippet(r);
        if (snip) log(`  ${cmd}: output → ${snip}`);
        const reason = `pipeline stage '${cmd}' failed` + (snip ? `: ${snip}` : '');
        call(cliPath, store.root, ['block', ref, '--needs', 'human-input', '--reason', reason]);
        blocked.push(t.id); ok = false; break;
      }
    }
    if (ok) merged.push(t.id);
  }
  return { merged, blocked, stopped: 'empty' };
}
