// Chalk Protocol — the unattended driver loop (P0 #2). Turns the read→work→verify→write loop
// into a single `chalk run`: it pulls the next runnable task, hands that task's context to a
// BYO executor on stdin, and lets the GATES decide — verify must be green and (if the cadence
// is due) review must pass before `done`. A task the executor can't make green is auto-BLOCKED
// (needs human-input) so the run continues on other runnable work instead of halting the whole
// session. This is what turns Chalk from a referee into a clock. Zero dependencies.
import { execSync } from 'node:child_process';
import { now, runnableTasks, buildContext, workdir } from './store.mjs';
import { verify } from './verify.mjs';
import { runReview } from './review.mjs';
import { missingRequiredTest } from './testgate.mjs';
import { runBreakit } from './breakit.mjs';
import { writeHandoff, overAttemptBudget } from './handoff.mjs';
import { postReviewToPr } from './prreview.mjs';

// The executor receives `chalk context` on stdin and edits the working tree (the task's git
// worktree in the pipeline, else the primary root). Its exit code is IGNORED — the verify gate,
// not the executor's self-report, decides success (preserves P4).
function runExecutor(store, task, cmd) {
  task.attempts = (task.attempts || 0) + 1; store.upsertTask(task); // churn budget: each work run counts
  try {
    execSync(cmd, { cwd: workdir(store, task), input: buildContext(store, task), stdio: ['pipe', 'inherit', 'inherit'], timeout: 10 * 60 * 1000 });
  } catch { /* executor may exit nonzero; the gate decides, not this */ }
}

function blockTask(store, t, reason) {
  t.blockedFrom = t.state;
  t.state = 'blocked';
  t.block = { needs: 'human-input', reason, at: now() };
  store.upsertTask(t);
  store.emitUpdate({ type: 'progress-update', title: `Blocked: ${t.title} (needs human-input)`, description: reason, taskId: t.id });
  // Leave a handoff so a fresh session can pick the task up instead of re-deriving its state.
  writeHandoff(store, t, { reason: 'block', note: reason });
}

// Build the verify-RED block reason, escalating to a churn note once the attempt budget is spent so
// the operator knows to resume in a fresh session rather than keep retrying in a polluted context.
function redReason(store, t) {
  return overAttemptBudget(store, t)
    ? `churn — ${t.attempts} attempts without a green verify; resume in a FRESH session`
    : 'verify RED after executor';
}

// Drive the queue. `reviewRequiredNow(store, task)` is injected (it lives in the CLI, cadence-aware).
export function runDriver(store, { until = 'empty', max = 50, dryRun = false, reviewRequiredNow = () => false, log = () => {} } = {}) {
  const planned = runnableTasks(store.tasks());
  if (dryRun) return { dryRun: true, planned: planned.map((t) => ({ id: t.id, title: t.title, milestone: t.milestone })) };

  const executorCmd = store.protocol().executor?.command;
  if (!executorCmd) return { degraded: true, next: planned[0] || null };

  const completed = [], blocked = [];
  let stopped = null, iterations = 0;
  while (iterations < max) {
    const t = runnableTasks(store.tasks())[0]; // re-read each loop — deps may have just cleared
    if (!t) { stopped = 'empty'; break; }
    iterations++;
    log(`▶ ${t.title}`);
    // start the task (P1 is already satisfied — runnableTasks only returns specd tasks)
    t.state = 'in-progress'; t.startedAt = now();
    store.upsertTask(t);
    runExecutor(store, t, executorCmd);

    if (!verify(store, { cwd: workdir(store, store.task(t.id)) }).green) {
      blockTask(store, store.task(t.id), redReason(store, store.task(t.id)));
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // Test-enforcement gate: a vacuously-green verify can't certify an untested feature.
    if (missingRequiredTest(store, store.task(t.id))) {
      blockTask(store, store.task(t.id), 'no test in the change — a feature must add or change a test (verify can pass vacuously)');
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // Lever 3 — break-it: a locked test that still passes against the reverted code asserts nothing.
    const bi = runBreakit(store, store.task(t.id));
    if (!bi.skipped && bi.vacuous.length) {
      blockTask(store, store.task(t.id), `vacuous locked test — passes against pre-change code, asserts nothing: ${bi.vacuous.join(', ')}`);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    if (reviewRequiredNow(store, store.task(t.id))) {
      const r = runReview(store, store.task(t.id));
      const cur = store.task(t.id);
      cur.reviews = cur.reviews || [];
      if (r.status === 'ok') {
        cur.reviews.push({ at: now(), by: 'adversary', verdict: r.verdict, findings: r.findings });
        // Surface the verdict on the PR (no-op if this task has none) and record the LGTM signal.
        const posted = postReviewToPr(store, cur, { verdict: r.verdict, findings: r.findings });
        if (posted.lgtm) cur.pr = { ...(cur.pr || {}), lgtm: true };
      }
      store.upsertTask(cur);
      if (!(r.status === 'ok' && r.verdict === 'pass')) {
        blockTask(store, store.task(t.id), `review ${r.status === 'ok' ? r.verdict : 'error'}`);
        blocked.push(t.id);
        if (until === 'blocked') { stopped = 'blocked'; break; }
        continue;
      }
    }
    const done = store.task(t.id);
    done.state = 'done'; done.doneAt = now();
    store.upsertTask(done);
    store.emitUpdate({ type: 'work-item-accepted', title: `Done: ${done.title}`, taskId: done.id });
    completed.push(done.id);
    log(`✓ ${done.title}`);
  }
  if (!stopped) stopped = iterations >= max ? 'max' : 'empty';
  return { completed, blocked, stopped, iterations };
}
