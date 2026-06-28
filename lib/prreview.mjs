// Chalk Protocol — surface the adversarial review ON the GitHub PR. The verdict is computed locally
// (lib/review.mjs), but a human reviewing the PR — and the merge gate — needs it visible there: the
// blocking findings as a comment on block, an explicit LGTM on pass. GitHub forbids approving your
// own PR from the opening account, so "LGTM" is a comment (not a formal approval), which works with
// the single account the pipeline already uses. Zero deps beyond the spine.
import { gh as runGh } from './git.mjs';
import { workdir } from './store.mjs';

// The LGTM marker the pass comment carries — the merge gate and a human both look for it.
export const LGTM = 'LGTM';

// Render the PR comment body for a verdict. Pass → an LGTM sign-off; block → the findings, so they
// live on the PR rather than only in the local spine.
export function reviewComment({ verdict, findings = [] }) {
  if (verdict === 'pass') {
    return `### 🤖 Chalk adversarial review — **${LGTM}** ✅\n\n` +
      `The change satisfies every acceptance criterion across correctness, test-adequacy, ` +
      `design-intent, and regression. Clear to merge.`;
  }
  const lines = findings.length
    ? findings.map((f) => `- **${f.severity || '?'}** \`${f.area || '?'}\` — ${f.note || ''}`.trim()).join('\n')
    : '- (no structured findings returned)';
  return `### 🤖 Chalk adversarial review — **changes requested** ⛔\n\n${lines}\n\n` +
    `Fix the blocking findings and push; the reviewer re-runs on the new commit.`;
}

// Post the verdict as a comment on the task's PR. No-op (returns {posted:false}) when there's no PR
// yet or no gh configured — the local review still stands. Best-effort: a gh failure is reported in
// `reason`, never thrown, so a flaky GitHub call can't fail the review gate. The body goes via stdin
// (`--body-file -`) so arbitrary markdown needs no shell-quoting.
export function postReviewToPr(store, task, { verdict, findings = [] }) {
  const num = task.pr?.number;
  const ghCmd = store.protocol().github?.command;
  if (!num) return { posted: false, lgtm: false, reason: 'no PR' };
  if (!ghCmd) return { posted: false, lgtm: false, reason: 'no gh' };
  try {
    runGh(workdir(store, task), ghCmd, `pr comment ${num} --body-file -`, { input: reviewComment({ verdict, findings }) });
    return { posted: true, lgtm: verdict === 'pass' };
  } catch (e) {
    return { posted: false, lgtm: false, reason: `gh: ${String(e.message).split('\n').slice(-1)[0]}` };
  }
}
