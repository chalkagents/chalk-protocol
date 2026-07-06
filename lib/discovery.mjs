// Chalk Protocol — Discovery / intake. The front door of the product lifecycle: a human's product
// brief is handed to a BYO agent (protocol.discovery.command) that proposes a SCOPED BACKLOG — tasks,
// each with acceptance criteria (and optional milestone / dependencies). `chalk discover` then creates
// them as specd tasks, gated by the plan-approval checkpoint so a human validates the scope before any
// code is written. This is where the autonomous loop STARTS (brief → backlog → … → ship → feedback →
// brief). Mirrors the retro/feedback contract: agent emits JSON, chalk applies it. Zero deps.
import { execSync } from 'node:child_process';
import { withRunner } from './config.mjs';
import { parseLastJson } from './json.mjs';
import { withJsonOutput, unwrapAgentOutput } from './cost.mjs';

const str = (x) => (x == null ? '' : String(x)).trim();

// Keep only well-formed proposed tasks: a non-empty title AND at least one real criterion. Trims all
// fields, drops empty criteria, and dedupes by (case-insensitive) title — first one wins.
export function normalizeProposal(raw) {
  const tasks = raw && Array.isArray(raw.tasks) ? raw.tasks : [];
  const seen = new Set();
  const out = [];
  for (const t of tasks) {
    const title = str(t && t.title);
    const criteria = (t && Array.isArray(t.criteria) ? t.criteria : []).map(str).filter(Boolean);
    if (!title || !criteria.length) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, criteria, milestone: str(t.milestone) || undefined, after: (Array.isArray(t.after) ? t.after : []).map(str).filter(Boolean) });
  }
  return out;
}

// Run the BYO discovery agent on the brief and parse { tasks, spec? }. Tolerant JSON extraction,
// cost-logged, never throws — same shape as runRetro/runFeedback.
export function runDiscovery(store, brief) {
  const cmd = store.protocol().discovery?.command;
  if (!cmd) return { status: 'unconfigured' };
  let raw = '';
  const t0 = Date.now();
  try { raw = execSync(withJsonOutput(withRunner(store.protocol().runner, cmd)), { cwd: store.root, input: brief, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 }); }
  catch (e) { raw = `${e.stdout || ''}${e.stderr || ''}`; }
  const { text, usage } = unwrapAgentOutput(raw); // envelope off BEFORE the parser (#99)
  try { store.logCost({ stage: 'discovery', agent: 'discovery', ms: Date.now() - t0, ...(usage || {}) }); } catch { /* ledger best-effort */ }
  const o = parseLastJson(text, (x) => Array.isArray(x.tasks));
  if (!o) return { status: 'error', raw: (text || '').slice(-400) };
  return { status: 'ok', spec: str(o.spec) || undefined, tasks: normalizeProposal(o) };
}
