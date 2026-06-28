// Chalk Protocol — the fix → re-verify → re-review loop. A genuine review BLOCK shouldn't end the run:
// the reviewer's findings are in the task context (buildContext), so re-running `work` lets the
// executor address them, `commit` records the fix, and `review` re-checks — looping until the review
// passes or the churn budget is spent (then the caller hands off + blocks). `chalk work` no-ops once
// a task is past 'verified', so each round rewinds the pipeline stage to force a fresh executor run.
// Stages run as subprocesses (the injected `call`) so each gate's exit code still decides.
import { git as runGit } from './git.mjs';
import { workdir } from './store.mjs';

// Push the fix to the PR's remote branch. CRITICAL: the `pr` stage (which normally pushes) already
// ran before review, and re-running it would re-create the PR — so the loop must push directly, else
// `merge` would squash-merge the STALE branch and silently drop the reviewer-approved fix. Injectable
// so the unit test stays git-free; best-effort (a non-git/local run has no branch to push).
function defaultPush(store, task) {
  if (task?.branch) { try { runGit(workdir(store, task), `push origin ${task.branch}`); } catch { /* surfaced by a later gate */ } }
}

export function reviewFixLoop({ store, ref, call, cliPath, maxRounds, push = defaultPush }) {
  for (let round = 1; round <= maxRounds; round++) {
    const t = store.task(ref);
    t.pipeline = { ...(t.pipeline || {}), stage: 'branched' }; // rewind so `work` re-runs the executor
    store.upsertTask(t);
    if (call(cliPath, store.root, ['work', ref]).status !== 0) return { passed: false, rounds: round - 1 };
    call(cliPath, store.root, ['commit', ref]); // record the fix (a no-op commit is fine — we gate on review)
    push(store, store.task(ref));               // push the fix so merge squash-merges the FIXED branch
    if (call(cliPath, store.root, ['review', ref]).status === 0) return { passed: true, rounds: round };
  }
  return { passed: false, rounds: maxRounds };
}
