// Chalk Protocol — the Feedback loop. Closes the product cycle: external signals (user feedback,
// metrics, production errors) dropped under .chalk/feedback/ are collected and handed to a BYO
// analysis agent (protocol.feedback.command) that proposes improvement issues — which `chalk
// feedback` files into the backlog, so what ships is learned from and the next cycle improves the
// product. The retro engine does this for the PROTOCOL from a run digest; this does it for the
// PRODUCT from real-world signals. Zero dependencies beyond the spine.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withRunner } from './config.mjs';
import { parseLastJson } from './json.mjs';
import { withJsonOutput, unwrapAgentOutput } from './cost.mjs';

const SIGNAL_EXT = /\.(md|txt|json)$/i;
export const feedbackDir = (store) => join(store.root, '.chalk', 'feedback');

// The tool's OWN repo — where a DOWNSTREAM user's feedback should land (#157). Overridable for forks.
export const UPSTREAM_REPO = 'chalkagents/chalk-protocol';

// Build a prefilled GitHub new-issue URL so anyone who `npm i`-d chalk can reach the maintainers with
// no auth/token — the standard OSS "report a bug" pattern (#157). Pure + percent-encoded → unit-testable,
// no network. The message goes in the body along with the chalk version; a `user-feedback` label is set.
export function buildUpstreamFeedbackUrl({ message, version, repo = UPSTREAM_REPO }) {
  const msg = String(message || '').trim();
  const title = `[user-feedback] ${msg.split('\n')[0].slice(0, 72)}`;
  const body = `${msg}\n\n---\n_reported via \`chalk feedback --submit\` · chalk-protocol ${version || 'unknown'}_`;
  const enc = (v) => encodeURIComponent(v);
  return `https://github.com/${repo}/issues/new?title=${enc(title)}&body=${enc(body)}&labels=${enc('user-feedback')}`;
}

// A one-line, opt-out nudge for the END of a `chalk run` — closes the product loop by pointing a
// user who just felt the tool (merged work, or hit a block worth reporting) at `chalk feedback
// --submit`, the zero-auth upstream channel (#157). Deliberately quiet so it never nags: silent on a
// no-op run (nothing merged AND nothing blocked → nothing to react to) and whenever CHALK_NO_NUDGE is
// set to any non-empty value. Pure (env injected) → unit-testable, no I/O. Returns the nudge string,
// or null to print nothing. (#155)
export function feedbackNudge({ merged = 0, blocked = 0, env = process.env } = {}) {
  if (env && env.CHALK_NO_NUDGE) return null;      // explicit opt-out — any non-empty value silences it
  if (merged <= 0 && blocked <= 0) return null;    // a no-op sweep: nothing happened, so don't ask
  return 'How did that go? Send the chalk maintainers a note: chalk feedback --submit "…"  (silence with CHALK_NO_NUDGE=1)';
}

// Collect product signals into one digest for the analysis agent. Reads .md/.txt/.json directly under
// .chalk/feedback/ (NOT the archive/ subdir of already-processed signals), plus any opts.input text.
// Returns { digest, files }: the combined text and the source file paths (so the caller can archive
// them after filing). Empty digest + [] when there are no signals.
export function collectSignals(store, { input = '' } = {}) {
  const dir = feedbackDir(store);
  const files = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      try { if (statSync(p).isFile() && SIGNAL_EXT.test(name)) files.push(p); } catch { /* skip */ }
    }
  }
  const parts = [];
  for (const p of files) { try { parts.push(`### ${p.split('/').pop()}\n${readFileSync(p, 'utf8').trim()}`); } catch { /* unreadable */ } }
  if (input && input.trim()) parts.push(`### (inline)\n${input.trim()}`);
  const digest = parts.length ? `# Product feedback signals\n\n${parts.join('\n\n')}\n` : '';
  return { digest, files };
}

// Run the BYO analysis agent on the signals digest and parse { issues:[{title, body, severity,
// labels}] }. Mirrors runRetro: tolerant JSON extraction, cost-logged, never throws.
export function runFeedback(store, signals) {
  const cmd = store.protocol().feedback?.command;
  if (!cmd) return { status: 'unconfigured' };
  let raw = '';
  const t0 = Date.now();
  try { raw = execSync(withJsonOutput(withRunner(store.protocol().runner, cmd)), { cwd: store.root, input: signals, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { raw = `${e.stdout || ''}${e.stderr || ''}`; }
  const { text, usage } = unwrapAgentOutput(raw); // envelope off BEFORE the parser (#99)
  try { store.logCost({ stage: 'feedback', agent: 'feedback', ms: Date.now() - t0, ...(usage || {}) }); } catch { /* ledger best-effort */ }
  const o = parseLastJson(text, (x) => Array.isArray(x.issues));
  if (!o) return { status: 'error', raw: (text || '').slice(-400) };
  return { status: 'ok', issues: Array.isArray(o.issues) ? o.issues : [] };
}
