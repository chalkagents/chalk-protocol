// Chalk Protocol — P5 adversarial review gate.
// Research: agent review is necessary but NOT sufficient and is often wrong, so it (a) runs
// ADVERSARIALLY (try to refute, default to block), (b) is forced to cover the dimensions
// agents systematically miss — test-adequacy, design-intent, regressions — and (c) is
// overridable at `done` with a logged reason. BYO-reviewer: any CLI/script that reads the
// prompt on stdin and prints a JSON verdict on stdout.
import { execSync } from 'node:child_process';
import { withRunner } from './config.mjs';
import { gitTry } from './git.mjs';
import { workdir, SPINE_STATE_PATHS } from './store.mjs';
import { parseLastJson } from './json.mjs';
import { withJsonOutput, unwrapAgentOutput } from './cost.mjs';

export const REVIEW_RUBRIC = `You are an ADVERSARIAL release-gate reviewer. Your job is to REFUTE the claim that this
change correctly and completely satisfies every acceptance criterion. Be skeptical. A
passing test suite is NOT proof — tests are often inadequate. Explicitly examine the
dimensions automated review usually misses:
  - correctness: does the code actually meet each criterion, including edge cases?
  - test-adequacy: do the tests truly exercise each criterion, or only happy paths?
  - design-intent: does the change fit the stated goal, or solve the wrong problem?
  - regression: could this break existing behavior?
HARD RULE — you MUST "block" if the change adds or alters behavior but NO test asserts that
behavior (a feature shipped with no test, or a test that would still pass if the change were
reverted). A green suite that does not cover the change is a vacuous pass, not adequacy.
Default to "block" if you are not fully confident the change satisfies every criterion.`;

export function buildReviewPrompt(meta, task, diff) {
  const criteria = (task.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c.text}`).join('\n') || '(none)';
  const tests = (task.tests || []).map((t) => t.path).join(', ') || '(none)';
  return `${REVIEW_RUBRIC}

# Project goal
${meta.project?.description || '(none)'}

# Task under review: ${task.title}
# Acceptance criteria (the contract):
${criteria}
# Locked acceptance tests (read-only): ${tests}

# Change under review (diff; if empty, inspect the working tree in this directory):
${diff || '(no diff captured — read the source files in the current directory)'}

Respond with ONLY a JSON object, no prose:
{"verdict":"pass"|"block","findings":[{"severity":"high"|"med"|"low","area":"correctness"|"test-adequacy"|"design-intent"|"regression","note":"..."}]}`;
}

// The prompt-side rendering of the captured diff. The body is capped so a big change can't blow the
// reviewer's context — but a SILENT cap blinds the adversary without telling it (it would judge a
// partial diff as the whole change). So the cut is marked, and the --stat file list is appended
// either way so the reviewer always knows the full blast radius and what to open in the tree.
export function formatDiffForReview(body, stat, cap = 20000) {
  if (!body || !body.trim()) return '';
  const hasStat = !!(stat && stat.trim());
  // The marker must not promise a file list that isn't there (stat capture is best-effort).
  const shown = body.length > cap
    ? `${body.slice(0, cap)}\n[diff truncated for this prompt: showing the first ${cap} of ${body.length} chars — ${hasStat ? 'the FULL changed-file list is below; read those files in the working tree' : 'read the remaining files in the working tree'}]`
    : body;
  return hasStat ? `${shown}\n\n## Changed files (git diff --stat)\n${stat.trim()}` : shown;
}

// Spine STATE the reviewer must NOT be shown (#114). Issue intake writes tasks.json + board rows
// for the WHOLE imported batch, and per-task start/spec/pin churn the same files — none of it is the
// change under review, but it floats in the working tree (manual mode) or on-branch and bundled into
// every reviewed diff, burning the adversary's attention run after run ("keep diffs small and
// scoped"). Excluded as git pathspecs. Contract ARTIFACTS stay visible: `.chalk/tests/` e2e specs
// and `.chalk/evidence/` are part of what a change legitimately delivers. The path set is defined
// once as SPINE_STATE_PATHS (store.mjs) and shared with the issue-intake commit (#131) so the two
// gates cannot diverge — see that constant's note.
export const REVIEW_DIFF_EXCLUDES = SPINE_STATE_PATHS.map((p) => `':(exclude)${p}'`);
// `-- .` keeps everything positive; the excludes drop spine state. Applied to both diff and --stat.
const diffPathspec = ` -- . ${REVIEW_DIFF_EXCLUDES.join(' ')}`;

// Capture the change under review. In the pipeline the change is already COMMITTED on a feature
// branch by review time, so `git diff HEAD` is empty — fall back to diffing against the base branch
// so the reviewer actually sees the work. Spine state is excluded so the adversary reviews the CODE
// (and its contract tests), not queue bookkeeping (#114).
// The canonical empty-tree object — diffing against it renders HEAD's whole content as additions,
// the "change" for a first commit that has no parent and no base delta.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
// The ordered diff strategies captureDiff tries — first non-empty wins. The base-relative pair prefers
// the REMOTE-tracking ref (origin/<base>) OVER the local branch: origin/<base> is the authoritative base
// — it is what the PR diffs against — whereas a local <base> is routinely stale or divergent. A rebased
// local `dev`, say, has a merge-base with the feature branch far back at the trunk, so `git diff
// <base>...HEAD` balloons into the entire base-vs-trunk history and floods the reviewer with unrelated
// changes (it also then blows past the diff budget and buries the real change). Fall back to the local
// branch (no remote / offline), then to last-commit + empty-tree so a change committed on the current
// branch with no base delta (single-branch / committed-to-main, `chalk demo`) is still reviewed —
// captureDiff only comes up empty when there is genuinely nothing to review (#151).
export function diffStrategies(base, emptyTree = EMPTY_TREE) {
  const cmds = ['git diff HEAD'];
  if (base) cmds.push(`git diff origin/${base}...HEAD`, `git diff ${base}...HEAD`);
  cmds.push('git diff HEAD~1 HEAD', `git diff ${emptyTree} HEAD`, 'git diff');
  return cmds;
}
function captureDiff(root, base) {
  for (const cmd of diffStrategies(base)) {
    try {
      const out = execSync(cmd + diffPathspec, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.trim()) {
        let stat = '';
        try { stat = execSync(`${cmd} --stat${diffPathspec}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* stat is best-effort */ }
        return formatDiffForReview(out, stat);
      }
    } catch { /* not a git repo / no such ref / no diff */ }
  }
  return '';
}

// Tolerant extraction of the verdict JSON from arbitrary reviewer stdout. Reviewers wrap their JSON in
// reasoning; a greedy /{...}/ span from the first stray brace to the last is unparseable (it blocked a real
// review), so recover the LAST balanced {...} object that is a valid verdict. Exported for tests — see lib/json.mjs.
export function parseVerdict(raw) {
  const o = parseLastJson(raw, (x) => ['pass', 'block'].includes(x.verdict));
  return o ? { verdict: o.verdict, findings: Array.isArray(o.findings) ? o.findings : [] } : null;
}

// Run the configured reviewer against a task. Returns {status, verdict?, findings?, raw?}.
export function runReview(store, task) {
  const meta = store.meta();
  const cmd = meta.protocol?.review?.command;
  if (!cmd) return { status: 'unconfigured' };
  const wd = workdir(store, task);
  // Never review NOTHING (#151). Inside a git work tree, an empty diff from every strategy means there
  // is genuinely no change — so the reviewer would grade an empty set, and a PASS on no diff is a
  // vacuous certification (the hazard #134/#151 name). Bail with a distinct status BEFORE spending a
  // reviewer call so `chalk review` aborts loudly. Scoped to a git work tree on purpose: OUTSIDE git,
  // chalk cannot compute a diff at all and the reviewer legitimately reads source files — a separate,
  // non-vacuous mode we must not block.
  const diff = captureDiff(wd, meta.protocol?.github?.base);
  if (!diff.trim() && gitTry(wd, 'rev-parse --is-inside-work-tree') === 'true') return { status: 'no-diff' };
  const prompt = buildReviewPrompt(meta, task, diff);
  let raw = '';
  const t0 = Date.now();
  try {
    // Run the reviewer IN the task's worktree, so reading source files inspects the branch's
    // changes (not the primary checkout, which doesn't have them).
    raw = execSync(withJsonOutput(withRunner(meta.protocol?.runner, cmd)), { cwd: wd, input: prompt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // Reviewer may exit nonzero on "block" — still parse. stdout FIRST and alone when present:
    // with json injection on, appending stderr after the envelope would break its parse and hide
    // the verdict (it is JSON-escaped inside the envelope's result). stderr only as a fallback.
    raw = String(e.stdout || '') || String(e.stderr || '');
  }
  const { text, usage } = unwrapAgentOutput(raw); // envelope off BEFORE the verdict parser (#99)
  store.logCost({ taskId: task.id, stage: 'review', agent: 'reviewer', ms: Date.now() - t0, ...(usage || {}) });
  const parsed = parseVerdict(text);
  if (!parsed) return { status: 'error', raw: (text || '').slice(-600) };
  return { status: 'ok', ...parsed, raw: text };
}
