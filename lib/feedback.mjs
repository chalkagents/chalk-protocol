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
