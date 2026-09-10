// Chalk Protocol — P5 adversarial review gate.
// Research: agent review is necessary but NOT sufficient and is often wrong, so it (a) runs
// ADVERSARIALLY (try to refute, default to block), (b) is forced to cover the dimensions
// agents systematically miss — test-adequacy, design-intent, regressions — and (c) is
// overridable at `done` with a logged reason. BYO-reviewer: any CLI/script that reads the
// prompt on stdin and prints a JSON verdict on stdout.
import { git, gitTry } from './git.mjs';
import { workdir, SPINE_STATE_PATHS } from './store.mjs';
import { parseLastJson } from './json.mjs';
import { runAgent } from './agent-runner.mjs';
import { resolveAgentRole } from './config.mjs';
import { reviewEvidence, formatReviewEvidence } from './review-evidence.mjs';

export const REVIEW_RUBRIC = `You are an ADVERSARIAL release-gate reviewer. Your job is to REFUTE the claim that this
change correctly and completely satisfies every acceptance criterion.
This review is read-only for the entire workspace, including .chalk metadata and ignored artifacts.
Do not run state-writing Chalk commands such as verify, audit, start or done in this workspace.
Inspect supplied receipts and recorded audit scope for the implementer's completed gate runs.
To independently exercise state-writing workflows, use an isolated scratch copy or temporary
fixture with its own output paths. Never inspect or copy held-out content. Run other checks here
only when they leave the workspace unchanged. The read-only guard remains mandatory.
Be skeptical. A
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

// The director-harness reframe (#192): the same adversarial pass also produces a DECISION DIGEST —
// the judgment calls the implementer resolved silently. Where findings are the referee catching a
// cheat, the digest is the accept button: it hands the human the choices worth confirming so they can
// accept or redirect, instead of re-reading the whole diff to discover them.
export const DECISION_DIGEST_INSTRUCTION = `Then, SEPARATELY from the pass/block judgment, produce a DECISION DIGEST — the judgment calls the
implementer resolved WITHOUT asking: an approach chosen over alternatives, a default value, a naming
call, a tradeoff, a scoping omission. For each, give the choice, its rationale, its blastRadius (how
much of the system/product it touches) and reversibility (how hard to undo later). Surface the ones a
human directing this work would want to confirm — not trivia. Include decisions EVEN WHEN YOU PASS: a
clean change still embeds judgment calls worth accepting or redirecting. Empty only if there genuinely
were none.`;

export function buildReviewPrompt(meta, task, diff, evidence) {
  const criteria = (task.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c.text}`).join('\n') || '(none)';
  const tests = (task.tests || []).map((t) => t.path).join(', ') || '(none)';
  return `${REVIEW_RUBRIC}

# Project goal
${meta.project?.description || '(none)'}

# Task under review: ${task.title}
# Acceptance criteria (the contract):
${criteria}
# Locked acceptance tests (read-only): ${tests}

${evidence ? formatReviewEvidence(evidence) : ''}

# Change under review (diff; if empty, inspect the working tree in this directory):
${diff || '(no diff captured — read the source files in the current directory)'}

${DECISION_DIGEST_INSTRUCTION}

Respond with ONLY a JSON object, no prose:
{"verdict":"pass"|"block","findings":[{"severity":"high"|"med"|"low","area":"correctness"|"test-adequacy"|"design-intent"|"regression","note":"..."}],"decisions":[{"choice":"...","rationale":"...","blastRadius":"low"|"med"|"high","reversibility":"easy"|"hard"}]}`;
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
const diffPathspec = ['--', '.', ...SPINE_STATE_PATHS.map((p) => `:(exclude)${p}`)];

// Capture the change under review. In the pipeline the change is already COMMITTED on a feature
// branch by review time, so `git diff HEAD` is empty — fall back to diffing against the base branch
// so the reviewer actually sees the work. Spine state is excluded so the adversary reviews the CODE
// (and its contract tests), not queue bookkeeping (#114).
// The canonical empty-tree object — diffing against it renders HEAD's whole content as additions,
// the "change" for a first commit that has no parent and no base delta.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
function captureDiff(root, base) {
  const cmds = [['diff', 'HEAD']];
  if (base) cmds.push(['diff', `${base}...HEAD`], ['diff', `origin/${base}...HEAD`]);
  // A change committed on the CURRENT branch with no separate base (single-branch / committed-to-main
  // usage, and the `chalk demo`) leaves every base-relative diff empty even though there IS reviewable
  // work. Fall back to the last commit, then the whole first commit — so captureDiff only comes up empty
  // when there is genuinely nothing to review (#151), not merely because there is no branch delta.
  cmds.push(['diff', 'HEAD~1', 'HEAD'], ['diff', EMPTY_TREE, 'HEAD']);
  cmds.push(['diff']);
  for (const args of cmds) {
    try {
      const out = git(root, [...args, ...diffPathspec]);
      if (out.trim()) {
        let stat = '';
        try { stat = git(root, [args[0], '--stat', ...args.slice(1), ...diffPathspec]); } catch { /* stat is best-effort */ }
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
  if (!o) return null;
  // decisions is additive (#192): the key is attached ONLY when the reviewer actually emits some, so a
  // verdict with no digest keeps the exact {verdict, findings} shape it always had — no consumer or
  // pinned contract sees a new field. Consumers read `r.decisions || []`, so absent == empty digest.
  const v = { verdict: o.verdict, findings: Array.isArray(o.findings) ? o.findings : [] };
  if (Array.isArray(o.decisions) && o.decisions.length) v.decisions = o.decisions;
  return v;
}

// Render ONE decision as a plain line (no ANSI — the caller adds colour), or null if it carries no
// choice/rationale to show. Names the choice with its blast-radius and reversibility so a director can
// triage at a glance; tolerant of a reviewer that omits fields.
export function formatDecisionLine(d) {
  if (!d || !(d.choice || d.rationale)) return null;
  const blast = d.blastRadius ? `blast:${d.blastRadius}` : 'blast:?';
  const undo = d.reversibility ? `undo:${d.reversibility}` : 'undo:?';
  const choice = String(d.choice || '(unnamed choice)').trim();
  const why = d.rationale ? ` — ${String(d.rationale).trim()}` : '';
  return `◇ [${blast} · ${undo}] ${choice}${why}`;
}

// Render the decision digest (#192) as plain lines. Empty in → empty out, so a change with no judgment
// calls prints nothing.
export function formatDecisionDigest(decisions) {
  if (!Array.isArray(decisions)) return [];
  return decisions.map(formatDecisionLine).filter(Boolean);
}

// Risk-based decision triage (#193). Score a decision from its blast-radius and reversibility into a
// coarse level — the calls that touch a lot AND are hard to undo are the ones a director must see. A
// reviewer that omits a field is treated as the middle (unknown ≠ safe). Pure.
const RISK_SCORE = { low: 0, med: 1, high: 2 };
const UNDO_SCORE = { easy: 0, hard: 2 };
export const RISK_RANK = { high: 3, med: 2, low: 1 };
export function decisionRisk(d) {
  const blast = RISK_SCORE[d?.blastRadius];
  const undo = UNDO_SCORE[d?.reversibility];
  const score = (blast ?? 1) + (undo ?? 1);
  return score >= 3 ? 'high' : score >= 2 ? 'med' : 'low';
}

// The director inbox (#193): the med/high-risk judgment calls, across ALL tasks, that a human has not
// yet accepted or redirected — highest-risk first. Reads each task's LATEST review's decisions (a later
// review supersedes an earlier one). This is the mirror of `chalk next`, but for the human directing the
// work: the empty-middle calls the agent made and moved past, surfaced for accept/redirect. Pure.
export function pendingDecisions(tasks) {
  const out = [];
  for (const t of tasks || []) {
    const review = (t.reviews || []).slice(-1)[0];
    if (!review || !Array.isArray(review.decisions)) continue;
    review.decisions.forEach((decision, index) => {
      if (!decision || decision.accepted || decision.redirected) return;
      const risk = decisionRisk(decision);
      if (risk === 'low') return; // the inbox is for the calls worth a human's attention, not trivia
      out.push({ taskId: t.id, taskTitle: t.title, index, decision, risk });
    });
  }
  return out.sort((a, b) => RISK_RANK[b.risk] - RISK_RANK[a.risk]);
}

// Run the configured reviewer against a task. Returns {status, verdict?, findings?, raw?}.
export function runReview(store, task) {
  const meta = store.meta();
  const profile = resolveAgentRole(meta.protocol, 'reviewer');
  if (!profile?.command) return { status: 'unconfigured' };
  const wd = workdir(store, task);
  // Never review NOTHING (#151). Inside a git work tree, an empty diff from every strategy means there
  // is genuinely no change — so the reviewer would grade an empty set, and a PASS on no diff is a
  // vacuous certification (the hazard #134/#151 name). Bail with a distinct status BEFORE spending a
  // reviewer call so `chalk review` aborts loudly. Scoped to a git work tree on purpose: OUTSIDE git,
  // chalk cannot compute a diff at all and the reviewer legitimately reads source files — a separate,
  // non-vacuous mode we must not block.
  const diff = captureDiff(wd, meta.protocol?.github?.base);
  if (!diff.trim() && gitTry(wd, 'rev-parse --is-inside-work-tree') === 'true') return { status: 'no-diff' };
  const prompt = buildReviewPrompt(meta, task, diff, reviewEvidence(store, task, wd));
  // Run the reviewer IN the task's worktree, so reading source files inspects the branch's changes.
  // A reviewer may exit nonzero on "block"; stdout-first retains a valid verdict in that case.
  const agentResult = runAgent('reviewer', {
    profile, cwd: wd, context: prompt, stderr: 'capture',
    failureOutput: 'stdout-first', cost: { store, taskId: task.id },
  });
  const text = agentResult.text;
  const parsed = agentResult.structured ? parseVerdict(JSON.stringify(agentResult.structured)) : null;
  if (!parsed) return { status: 'error', raw: (text || '').slice(-600), diagnostics: agentResult.diagnostics || [] };
  return { status: 'ok', ...parsed, raw: text };
}
