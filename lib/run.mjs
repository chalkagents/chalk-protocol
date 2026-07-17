// Chalk Protocol — the unattended driver loop (P0 #2). Turns the read→work→verify→write loop
// into a single `chalk run`: it pulls the next runnable task, hands that task's context to a
// BYO executor on stdin, and lets the GATES decide — verify must be green and (if the cadence
// is due) review must pass before `done`. A task the executor can't make green is auto-BLOCKED
// (needs human-input) so the run continues on other runnable work instead of halting the whole
// session. This is what turns Chalk from a referee into a clock. Zero dependencies.
import { now, runnableTasks, buildContext, workdir, openRaises } from './store.mjs';
import { runExecutorCaptured } from './cost.mjs';
import { withRunner } from './config.mjs';
import { verify } from './verify.mjs';
import { runReview } from './review.mjs';
import { missingRequiredTest } from './testgate.mjs';
import { runBreakit } from './breakit.mjs';
import { runMutation } from './mutation.mjs';
import { writeHandoff, overAttemptBudget } from './handoff.mjs';
import { BLOCKED_TITLE, CHURN_REASON, VERIFY_RED_REASON } from './markers.mjs';
import { postReviewToPr } from './prreview.mjs';
import { planApprovalRequired, criteriaAcceptedRequired } from './planning.mjs';

// The executor receives `chalk context` on stdin and edits the working tree (the task's git
// worktree in the pipeline, else the primary root). Its exit code is IGNORED — the verify gate,
// not the executor's self-report, decides success (preserves P4). A claude-shaped command runs
// captured so its usage lands in the cost ledger (#99); other runners keep live streaming.
function runExecutor(store, task, cmd) {
  task.attempts = (task.attempts || 0) + 1; store.upsertTask(task); // churn budget: each work run counts
  const t0 = Date.now();
  const { usage } = runExecutorCaptured(withRunner(store.protocol().runner, cmd), { cwd: workdir(store, task), input: buildContext(store, task) }); // runner prefix: same rule as every sibling stage
  store.logCost({ taskId: task.id, stage: 'work', agent: 'executor', ms: Date.now() - t0, ...(usage || {}) });
}

function blockTask(store, t, reason, needs = 'human-input') {
  t.blockedFrom = t.state;
  t.state = 'blocked';
  t.block = { needs, reason, at: now() };
  store.upsertTask(t);
  store.emitUpdate({ type: 'progress-update', title: BLOCKED_TITLE(t, needs), description: reason, taskId: t.id });
  // Leave a handoff so a fresh session can pick the task up instead of re-deriving its state.
  writeHandoff(store, t, { reason: 'block', note: reason });
}

// Build the verify-RED block reason, escalating to a churn note once the attempt budget is spent so
// the operator knows to resume in a fresh session rather than keep retrying in a polluted context.
function redReason(store, t) {
  return overAttemptBudget(store, t) ? CHURN_REASON(t.attempts) : VERIFY_RED_REASON;
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
    // Plan-approval gate: when planning is required, pause for the human rather than run the executor.
    if (planApprovalRequired(store, t)) {
      blockTask(store, t, 'plan not approved — a human must answer the scoping questions and run `chalk approve-plan`');
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // Alignment gate (the director checkpoint): when director mode is required, pause for the human to
    // accept the criteria as the definition of done rather than build blindly (#191).
    if (criteriaAcceptedRequired(store, t)) {
      blockTask(store, t, 'criteria not accepted — a human must run `chalk align` to accept the acceptance criteria as the definition of done before build');
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // start the task (P1 is already satisfied — runnableTasks only returns specd tasks)
    t.state = 'in-progress'; t.startedAt = now();
    store.upsertTask(t);
    runExecutor(store, t, executorCmd);

    // #211: if the agent RAISED a fork mid-work, pause for the director rather than ship a guess.
    const raised = openRaises(store.task(t.id));
    if (raised.length) {
      blockTask(store, store.task(t.id), `${raised.length} fork(s) raised for the director — answer via \`chalk pending\`, then re-run`);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }

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
    if (!bi.skipped && bi.inconclusive?.length) console.error(`⚠ break-it probe INCONCLUSIVE for ${bi.inconclusive.join(', ')} — probe command could not run (check protocol.breakTest). Not counted as passing.`);
    if (!bi.skipped && bi.vacuous.length) {
      blockTask(store, store.task(t.id), `vacuous locked test — passes against pre-change code, asserts nothing: ${bi.vacuous.join(', ')}`);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // Mutation-adequacy gate (rigorous lever 3): surviving mutants in the changed code = weak tests.
    const mut = runMutation(store, store.task(t.id));
    if (!mut.skipped && mut.inconclusive?.length) console.error(`⚠ mutation probe INCONCLUSIVE for ${mut.inconclusive.join(', ')} — tool could not run (check protocol.mutation). Not counted as adequate.`);
    if (!mut.skipped && mut.survived.length) {
      blockTask(store, store.task(t.id), `weak tests — mutants survived in changed code: ${mut.survived.join(', ')}`);
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
        // A genuine verdict block is agent-owned work (fix the findings, re-review) → needs:review.
        // A reviewer ERROR has no findings to fix — config/human problem, stays human-input (#46).
        blockTask(store, store.task(t.id), `review ${r.status === 'ok' ? r.verdict : 'error'}`, r.status === 'ok' ? 'review' : 'human-input');
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
