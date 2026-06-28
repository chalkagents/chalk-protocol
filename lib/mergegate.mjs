// Chalk Protocol — the merge gate decision. A change merges only when it's safe AND accountable:
// nothing broke (remote CI or local verify), the PR records what was done, and — when review is
// required — the adversary passed and signed off with an LGTM on the PR. Pure function so it's
// unit-testable; `chalk merge` computes `broke`/`reviewRequired` and enforces the result.
import { hasRecording } from './prbody.mjs';

// Returns the list of reasons this task may NOT merge (empty array = clear). `broke` is a brokeCheck
// result ({ ok, source, detail }); `reviewRequired` is reviewRequiredNow(store, task).
export function mergeBlockers(store, task, { reviewRequired, broke }) {
  const out = [];
  if (!broke?.ok) out.push(`broke-check failed — ${broke?.detail || 'unknown'} (${broke?.source || '?'})`);
  if (!hasRecording(task)) out.push('the PR has no recording of what was done — re-run `chalk pr <id>`');
  if (reviewRequired) {
    const lastPass = (task.reviews || []).slice(-1)[0]?.verdict === 'pass';
    if (!lastPass) out.push('a passing adversarial review is required (P5)');
    else if (!task.pr?.lgtm) out.push('no LGTM on the PR — a passing review must be posted before merge');
  }
  return out;
}
