// Chalk Protocol — the unattended issue→merge driver. Walks each issue-backed task through the
// ordered pipeline stages by invoking the discrete `chalk` commands as subprocesses (so each
// stage's gate decides via its exit code, and a die() can't kill the whole run). Any non-zero
// stage blocks that task (needs:human-input) and the driver continues to the next issue — the
// gates are the safety, exactly as in `chalk run`. Resumable: each command no-ops/advances from
// task.pipeline.stage. Zero dependencies.
import { spawnSync, spawn } from 'node:child_process';
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

export function runPipeline(store, cliPath, { max = 20, dryRun = false, only = null, stopBefore = null, log = () => {} } = {}) {
  const proto = store.protocol();
  const queue = store.tasks().filter((t) => t.issue && t.state !== 'done' && t.state !== 'blocked' && (!only || t.id === only)).slice(0, max);
  // `stopBefore` truncates the chain before a stage — the parallel driver runs each task's chain up
  // to (not including) `merge` concurrently, then serializes the merges itself (#110 slice 3).
  const stages = stopBefore && ORDER.includes(stopBefore) ? ORDER.slice(0, ORDER.indexOf(stopBefore)) : ORDER;
  if (dryRun) { for (const t of queue) log(`▶ #${t.issue.number} ${t.title}  ${stages.join(' → ')}`); return { dryRun: true, planned: queue.map((t) => t.id) }; }

  const merged = [], blocked = [];
  for (const t of queue) {
    const ref = t.id.slice(0, 12);
    log(`▶ #${t.issue.number} ${t.title}`);
    let ok = true;
    for (const cmd of stages) {
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
        // exhaustion, `chalk block` parks it (needs:review) AND writes a handoff with the findings.
        const maxRounds = store.protocol().handoff?.maxAttempts ?? 3;
        log(`  review: BLOCK — entering fix→re-review loop (≤${maxRounds} rounds)`);
        const res = reviewFixLoop({ store, ref, call, cliPath, maxRounds });
        if (!res.passed) {
          // Reviewer-induced: chalk's own gate refuted the change — agent-owned work, not a
          // pending human dependency, so it gets its own needs category (#46).
          call(cliPath, store.root, ['block', ref, '--needs', 'review', '--reason', reviewBlockReason(store, ref, r)]);
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
          // A reviewer that ERRORS twice (no verdict, no findings) is a config/human problem,
          // not a refutation — there are no findings to fix, so it is NOT needs:review.
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

// Run `fn` over `items` with at most `limit` in flight, preserving result order by index. The unit of
// concurrency is a whole task chain — each is a subprocess, so spawnSync inside a chain blocks only
// THAT child, never the orchestrator's event loop.
async function runPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i], i);
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

// A task's whole pre-merge chain, as an async subprocess: `chalk pipeline --only <id> --stop-before
// merge`. Reuses the sequential per-task logic verbatim (review-fix loop, auto-block, resumability);
// only the FAN-OUT is new. cwd is the spine `root`, NOT a worktree — the child's own `branch` stage
// creates this task's worktree and every later stage targets it via workdir(store, task), so
// concurrent chains isolate through per-task worktrees (not through cwd) and never share a checkout.
// Resolves { status } — 0 means the chain reached the merge point cleanly.
function defaultRunChain(cliPath, root, t) {
  return new Promise((res) => {
    const c = spawn('node', [cliPath, 'pipeline', '--only', t.id, '--stop-before', 'merge'], { cwd: root, stdio: 'ignore' });
    c.on('close', (code) => res({ status: code ?? 1 }));
    c.on('error', () => res({ status: 1 }));
  });
}

// The gated squash-merge. Runs SERIALLY (never concurrently), so spawnSync is correct here.
function defaultRunMerge(cliPath, root, t) {
  const r = spawnSync('node', [cliPath, 'merge', t.id.slice(0, 12)], { cwd: root, encoding: 'utf8' });
  return { status: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// Parallel issue→merge driver (#110 slice 3). Fans out per-task chains — up to `parallel` at once —
// each in its own git worktree, then SERIALIZES the merges (they squash onto the shared base branch
// and would otherwise contend). Safe because of the earlier slices: per-worktree P6 integrity (s1)
// means a second in-progress task can't false-break the first, and the cross-process spine lock (s2)
// means concurrent stage subprocesses can't clobber tasks.json. The stage runners are injectable so
// the concurrency + merge-serialization invariants are testable without real git/gh.
export async function runPipelineParallel(store, cliPath, {
  max = 20, parallel = 4, log = () => {},
  runChain = (t) => defaultRunChain(cliPath, store.root, t),
  runMerge = (t) => defaultRunMerge(cliPath, store.root, t),
} = {}) {
  const limit = Math.max(1, Number(parallel) || 1);
  const queue = store.tasks().filter((t) => t.issue && t.state !== 'done' && t.state !== 'blocked').slice(0, max);
  log(`▶ fan-out: ${queue.length} task(s), ≤${limit} concurrent chain(s); merges serialize`);

  // Phase A — chains (branch..evidence) concurrently.
  const chainResults = await runPool(queue, limit, async (t) => {
    log(`  ▷ #${t.issue.number} ${t.title}: chain start`);
    const r = await runChain(t);
    log(`  ${r.status === 0 ? '◁' : '⊘'} #${t.issue.number}: chain ${r.status === 0 ? 'ready to merge' : `blocked (exit ${r.status})`}`);
    return r;
  });

  // Phase B — merges, one at a time (base-branch contention). Only chains that reached the merge
  // point cleanly are merged; the rest were already auto-blocked by their own chain's gate.
  const merged = [], blocked = [];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (!chainResults[i] || chainResults[i].status !== 0) { blocked.push(t.id); continue; }
    const m = await runMerge(t);
    if (m && m.status === 0) { merged.push(t.id); log(`  ✓ #${t.issue.number}: merged`); }
    else { blocked.push(t.id); log(`  ⊘ #${t.issue.number}: merge blocked (exit ${m?.status})`); }
  }
  return { merged, blocked, parallel: limit };
}
