import { checkApproval, currentReview } from './approval-inputs.mjs';
// Chalk Protocol — the unattended driver loop (P0 #2). Turns the read→work→verify→write loop
// into a single `chalk run`: it pulls the next runnable task, hands that task's context to a
// BYO executor on stdin, and lets the GATES decide — verify must be green and (if the cadence
// is due) review must pass before `done`. A task the executor can't make green is auto-BLOCKED
// (needs human-input) so the run continues on other runnable work instead of halting the whole
// session. This is what turns Chalk from a referee into a clock. Zero dependencies.
import { now, runnableTasks, buildContext, workdir, openRaises, resolveDirectives, depsSatisfied } from './store.mjs';
import { runAgent } from './agent-runner.mjs';
import { resolveAgentRole } from './config.mjs';
import { verify, verificationFailureReason } from './verify.mjs';
import { pinReviewBase, formatReviewInputs } from './review-inputs.mjs';
import { runReview } from './review.mjs';
import { missingRequiredTest } from './testgate.mjs';
import { runBreakit } from './breakit.mjs';
import { runMutation } from './mutation.mjs';
import { writeHandoff, overAttemptBudget } from './handoff.mjs';
import { BLOCKED_TITLE, CHURN_REASON, VERIFY_RED_REASON } from './markers.mjs';
import { postReviewToPr } from './prreview.mjs';
import { persistReview } from './review-record.mjs';
import { planApprovalRequired, criteriaAcceptedRequired, completionApprovalBlockers } from './planning.mjs';
import { finishTarget, formatFinishTarget, finishTrackingBlocker, finishContractCurrent, validateFinishVerification } from './run-finish.mjs';
import { verificationCoverage } from './verification-coverage.mjs';

// The executor receives `chalk context` on stdin and edits the working tree (the task's git
// worktree in the pipeline, else the primary root). Its exit code is IGNORED — the verify gate,
// not the executor's self-report, decides success (preserves P4). A claude-shaped command runs
// captured so its usage lands in the cost ledger (#99); other runners keep live streaming.
function runExecutor(store, task, profile) {
  task.attempts = (task.attempts || 0) + 1; store.upsertTask(task); // churn budget: each work run counts
  runAgent('executor', { profile, cwd: workdir(store, task), context: buildContext(store, task), output: { kind: 'text' }, cost: { store, taskId: task.id } });
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
function redReason(store, t, verification) {
  return verificationFailureReason(verification, overAttemptBudget(store, t) ? CHURN_REASON(t.attempts) : VERIFY_RED_REASON);
}

// Drive the queue. `reviewRequiredNow(store, task)` is injected (it lives in the CLI, cadence-aware).
export function runDriver(store, { until = 'empty', max = 50, dryRun = false, finish, forceRerun = false, reviewRequiredNow = () => false, log = () => {} } = {}) {
  if (forceRerun && !finish) throw new Error('--force-rerun requires --finish <id>');
  const selected = finish !== undefined ? finishTarget(store, finish) : null;
  const planned = selected ? [selected] : runnableTasks(store.tasks());
  if (selected) log(formatFinishTarget(store, selected));
  if (dryRun) return { dryRun: true, planned: planned.map((t) => ({ id: t.id, title: t.title, milestone: t.milestone })) };
  if (selected) { max = 1; until = 'blocked'; }

  const executorProfile = resolveAgentRole(store.protocol(), 'executor');
  if (!selected && !executorProfile?.command) return { degraded: true, next: planned[0] || null };

  const timed = (task, stage, operation) => {
    if (!selected) return operation();
    log(`${stage}: running`);
    const started = Date.now();
    const result = operation();
    const durationMs = Date.now() - started;
    const verification = stage.startsWith('verify');
    log(`${stage}: ${durationMs} ms${verification ? `; ${result.green ? 'GREEN' : 'RED'}` : ''}`);
    store.emitUpdate({ title: `Finish ${stage} completed`, taskId: task.id, description: `${durationMs} ms`,
      ...(verification ? { verification: verificationCoverage(result) } : {}) });
    if (verification && result.evidence?.path) log(`verification record: ${result.evidence.path}`);
    return result;
  };

  const completed = [], blocked = [];
  let stopped = null, iterations = 0;
  while (iterations < max) {
    const t = selected ? finishTarget(store, selected.id) : runnableTasks(store.tasks())[0]; // re-read each loop — deps may have just cleared
    if (!t) { stopped = 'empty'; break; }
    iterations++;
    log(`▶ ${t.title}`);
    // State alone is not a P1 contract: legacy/imported specd tasks may be empty.
    if (!(t.acceptanceCriteria?.length || t.tests?.length)) {
      blockTask(store, t, 'GATE P1: task has no acceptance criteria or locked tests — add a contract before execution');
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
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
    // Start only after the explicit P1 and configured approval checks above.
    if (!selected) {
      t.reviewBase ||= pinReviewBase(workdir(store, t));
      t.state = 'in-progress'; t.startedAt = now();
      store.upsertTask(t);
      runExecutor(store, t, executorProfile);
    } else {
      const tracking = finishTrackingBlocker(store, t);
      if (tracking) throw new Error(tracking);
    }

    // #211: if the agent RAISED a fork mid-work, pause for the director rather than ship a guess.
    const raised = openRaises(store.task(t.id));
    if (raised.length) {
      // needs:'decision' (NOT the default 'human-input') so `chalk pending answer` recognises + unblocks it.
      blockTask(store, store.task(t.id), `${raised.length} fork(s) raised for the director — answer via \`chalk pending\`, then re-run`, 'decision');
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }

    const beforeVerify = store.task(t.id);
    const approvals = completionApprovalBlockers(store, beforeVerify);
    if (approvals.length) {
      blockTask(store, beforeVerify, approvals.join('; ')); blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    const verifiedRevision = beforeVerify.specRevision || 0;
    let verification = timed(t, 'verify', () => verify(store, { cwd: workdir(store, beforeVerify) }));
    const initialVerificationApproval = verification.approvals?.[t.id];
    if (!verification.green) {
      blockTask(store, store.task(t.id), redReason(store, store.task(t.id), verification), verification.freshness === 'stale' || verification.approvalError ? 'review' : 'human-input');
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
    if (selected && !bi.skipped && bi.inconclusive?.length) {
      blockTask(store, store.task(t.id), `configured break-it probe is inconclusive: ${bi.inconclusive.join(', ')} — resolve protocol.breakTest before finishing`, 'review');
      blocked.push(t.id); stopped = 'blocked'; break;
    }
    if (!bi.skipped && bi.inconclusive?.length) console.error(`⚠ break-it probe INCONCLUSIVE for ${bi.inconclusive.join(', ')} — probe command could not run (check protocol.breakTest). Not counted as passing.`);
    if (!bi.skipped && bi.vacuous.length) {
      blockTask(store, store.task(t.id), `vacuous locked test — passes against pre-change code, asserts nothing: ${bi.vacuous.join(', ')}`);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    // Mutation-adequacy gate (rigorous lever 3): surviving mutants in the changed code = weak tests.
    const mut = runMutation(store, store.task(t.id));
    if (selected && !mut.skipped && mut.inconclusive?.length) {
      blockTask(store, store.task(t.id), `configured mutation probe is inconclusive: ${mut.inconclusive.join(', ')} — resolve protocol.mutation before finishing`, 'review');
      blocked.push(t.id); stopped = 'blocked'; break;
    }
    if (!mut.skipped && mut.inconclusive?.length) console.error(`⚠ mutation probe INCONCLUSIVE for ${mut.inconclusive.join(', ')} — tool could not run (check protocol.mutation). Not counted as adequate.`);
    if (!mut.skipped && mut.survived.length) {
      blockTask(store, store.task(t.id), `weak tests — mutants survived in changed code: ${mut.survived.join(', ')}`);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    if (!bi.skipped || !mut.skipped) {
      if (selected) {
        const initial = finishContractCurrent(store, store.task(t.id), initialVerificationApproval);
        if (!initial.current) {
          blockTask(store, store.task(t.id), `inputs changed during adequacy probes: ${initial.reason}`, 'review');
          blocked.push(t.id); stopped = 'blocked'; break;
        }
      }
      verification = timed(t, 'verify after adequacy probes', () => verify(store, { cwd: workdir(store, store.task(t.id)) }));
      if (!verification.green) {
        blockTask(store, store.task(t.id), verificationFailureReason(verification, 'verification failed after restoring adequacy probes'));
        blocked.push(t.id);
        if (until === 'blocked') { stopped = 'blocked'; break; }
        continue;
      }
    }
    if (reviewRequiredNow(store, store.task(t.id))) {
      const reviewedTask = store.task(t.id);
      const reviewedRevision = reviewedTask.specRevision || 0;
      const r = timed(t, 'review', () => runReview(store, reviewedTask, { onInputs: input => log(formatReviewInputs(input)) }));
      if (selected) {
        log(`review: ${r.status === 'ok' ? r.verdict : r.status}`);
        for (const finding of r.findings || []) log(`[${finding.severity || 'finding'}] ${finding.note}`);
        for (const decision of r.decisions || []) log(`Decision: ${decision.choice} — ${decision.rationale}`);
        for (const diagnostic of r.diagnostics || []) log(`[${diagnostic.code}] ${diagnostic.message}`);
      }
      const cur = store.task(t.id);
      if ((cur.specRevision || 0) !== reviewedRevision) {
        blockTask(store, cur, 'specification changed during review — reload context and run chalk review again; no verdict was accepted', 'review');
        blocked.push(t.id);
        if (until === 'blocked') { stopped = 'blocked'; break; }
        continue;
      }
      cur.reviews = cur.reviews || [];
      if (r.status === 'ok') {
        cur.reviews.push({ at: now(), by: 'adversary', verdict: r.verdict, findings: r.findings, decisions: r.decisions || [], specRevision: reviewedRevision, approval: r.approval, inputs: r.inputs });
        // Surface the verdict on the PR (no-op if this task has none) and record the LGTM signal.
        const posted = postReviewToPr(store, cur, { verdict: r.verdict, findings: r.findings });
        if (posted.lgtm) cur.pr = { ...(cur.pr || {}), lgtm: true };
      }
      if (r.status === 'ok') {
        try {
          persistReview(store, cur, current => {
            if (cur.pr?.lgtm) current.pr = { ...(current.pr || {}), lgtm: true };
          });
        } catch (error) {
          blockTask(store, store.task(t.id), error.message, 'review');
          blocked.push(t.id);
          if (until === 'blocked') { stopped = 'blocked'; break; }
          continue;
        }
      }
      if (!(r.status === 'ok' && r.verdict === 'pass')) {
        // A genuine verdict block is agent-owned work (fix the findings, re-review) → needs:review.
        // Input-change errors have an actionable agent recovery path. Other
        // reviewer errors retain the existing configuration/human classification.
        const inputFailure = r.diagnostics?.find(diagnostic => ['approval-inputs', 'review-inputs'].includes(diagnostic.code));
        blockTask(store, store.task(t.id), inputFailure?.message || `review ${r.status === 'ok' ? r.verdict : 'error'}`, r.status === 'ok' || inputFailure ? 'review' : 'human-input');
        blocked.push(t.id);
        if (until === 'blocked') { stopped = 'blocked'; break; }
        continue;
      }
    }
    if (selected && forceRerun) {
      verification = timed(t, 'verify forced after review', () => verify(store, { cwd: workdir(store, store.task(t.id)) }));
      if (!verification.green) {
        blockTask(store, store.task(t.id), verificationFailureReason(verification), 'review');
        blocked.push(t.id); stopped = 'blocked'; break;
      }
    }
    if (selected) log('completion: checking live verification evidence and current gates');
    const admissionStarted = Date.now();
    let done, remainingApprovals = [], admissionNeeds = 'human-input';
    store.mutateTasks(tasks => {
      done = tasks.find(task => task.id === t.id);
      if (!done || done.state !== 'in-progress') throw new Error(`task is no longer in progress — reload chalk context ${t.id}`);
      remainingApprovals = completionApprovalBlockers(store, done);
      const freshVerification = checkApproval(store, 'verification', { approval: verification.approvals?.[t.id] }, done);
      if (!freshVerification.current) { remainingApprovals.push(freshVerification.reason); admissionNeeds = 'review'; }
      if (reviewRequiredNow(store, done) && !currentReview(store, done)) { remainingApprovals.push(`review approval is stale or historical — run chalk review ${done.id}`); admissionNeeds = 'review'; }
      if ((done.specRevision || 0) !== verifiedRevision) { remainingApprovals.push('specification changed after verification — reload context and retry'); admissionNeeds = 'review'; }
      if (selected) {
        const initial = finishContractCurrent(store, done, initialVerificationApproval);
        if (!initial.current) remainingApprovals.push(`initial verification inputs changed: ${initial.reason}`);
        if (!depsSatisfied(done, tasks)) remainingApprovals.push('task prerequisites changed before completion');
        const tracking = finishTrackingBlocker(store, done);
        if (tracking) remainingApprovals.push(tracking);
        if (!remainingApprovals.length) {
          try { validateFinishVerification(store, done, verification, () => {
            const current = store.task(done.id);
            if (!current || current.state !== 'in-progress' || (current.specRevision || 0) !== verifiedRevision) throw new Error('task changed during completion admission');
            const blockers = completionApprovalBlockers(store, current);
            if (blockers.length) throw new Error(blockers.join('; '));
            if (!depsSatisfied(current, store.tasks())) throw new Error('task prerequisites changed during completion admission');
            if (reviewRequiredNow(store, current) && !currentReview(store, current)) throw new Error(`review approval changed during admission — run chalk review ${current.id}`);
            const tracking = finishTrackingBlocker(store, current);
            if (tracking) throw new Error(tracking);
            const initial = finishContractCurrent(store, current, initialVerificationApproval);
            if (!initial.current) throw new Error(`initial verification inputs changed: ${initial.reason}`);
          }); }
          catch (error) { remainingApprovals.push(error.message); admissionNeeds = 'review'; }
        }
      }
      if (remainingApprovals.length) return tasks;
      if (done.pipeline) delete done.pipeline.verificationInvalidated;
      done.state = 'done'; done.doneAt = now(); done.completedSpecRevision = done.specRevision || 0;
      delete done.completionInvalidated;
      if (selected) resolveDirectives(done);
      return tasks;
    }, { protectOwner: true });
    if (remainingApprovals.length) {
      blockTask(store, store.task(t.id), remainingApprovals.join('; '), admissionNeeds);
      blocked.push(t.id);
      if (until === 'blocked') { stopped = 'blocked'; break; }
      continue;
    }
    store.emitUpdate({ type: 'work-item-accepted', title: `Done: ${done.title}`, taskId: done.id });
    if (selected) log(`completion: ${Date.now() - admissionStarted} ms; admitted live verification from this invocation`);
    completed.push(done.id);
    log(`✓ ${done.title}`);
  }
  if (!stopped) stopped = iterations >= max ? 'max' : 'empty';
  if (selected) for (const id of blocked) log(`blocked: ${store.task(id)?.block?.reason || 'completion gate failed'}`);
  return { completed, blocked, stopped, iterations };
}
