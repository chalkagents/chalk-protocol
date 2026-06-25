// Chalk Protocol — P5 adversarial review gate.
// Research: agent review is necessary but NOT sufficient and is often wrong, so it (a) runs
// ADVERSARIALLY (try to refute, default to block), (b) is forced to cover the dimensions
// agents systematically miss — test-adequacy, design-intent, regressions — and (c) is
// overridable at `done` with a logged reason. BYO-reviewer: any CLI/script that reads the
// prompt on stdin and prints a JSON verdict on stdout.
import { execSync } from 'node:child_process';
import { withRunner } from './config.mjs';

export const REVIEW_RUBRIC = `You are an ADVERSARIAL release-gate reviewer. Your job is to REFUTE the claim that this
change correctly and completely satisfies every acceptance criterion. Be skeptical. A
passing test suite is NOT proof — tests are often inadequate. Explicitly examine the
dimensions automated review usually misses:
  - correctness: does the code actually meet each criterion, including edge cases?
  - test-adequacy: do the tests truly exercise each criterion, or only happy paths?
  - design-intent: does the change fit the stated goal, or solve the wrong problem?
  - regression: could this break existing behavior?
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

function captureDiff(root) {
  for (const cmd of ['git diff HEAD', 'git diff']) {
    try {
      const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.trim()) return out.slice(0, 20000);
    } catch { /* not a git repo / no diff */ }
  }
  return '';
}

// Tolerant extraction of the verdict JSON from arbitrary reviewer stdout.
function parseVerdict(raw) {
  const m = raw && raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!['pass', 'block'].includes(o.verdict)) return null;
    return { verdict: o.verdict, findings: Array.isArray(o.findings) ? o.findings : [] };
  } catch { return null; }
}

// Run the configured reviewer against a task. Returns {status, verdict?, findings?, raw?}.
export function runReview(store, task) {
  const meta = store.meta();
  const cmd = meta.protocol?.review?.command;
  if (!cmd) return { status: 'unconfigured' };
  const prompt = buildReviewPrompt(meta, task, captureDiff(store.root));
  let raw = '';
  try {
    raw = execSync(withRunner(meta.protocol?.runner, cmd), { cwd: store.root, input: prompt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 });
  } catch (e) {
    raw = `${e.stdout || ''}${e.stderr || ''}`; // reviewer may exit nonzero on "block" — still parse
  }
  const parsed = parseVerdict(raw);
  if (!parsed) return { status: 'error', raw: (raw || '').slice(-600) };
  return { status: 'ok', ...parsed, raw };
}
