// Chalk Protocol — retrospective / self-healing. After a sweep, a read-only retro agent reads a
// digest of the run (events, reviewer findings, blocks, recent commits, existing lessons) and
// returns JSON {lessons, issues}: durable lessons to remember + concrete chalk defects worth fixing.
// chalk (not the agent) then applies it — appends lessons and files GitHub issues — so the loop
// discovers its own bugs and the next sweep fixes them. Zero dependencies.
import { execSync } from 'node:child_process';
import { runAgent } from './agent-runner.mjs';
import { resolveAgentRole } from './config.mjs';

// Build the run digest fed to the retro agent on stdin.
export function buildRetroDigest(store, { since = 25 } = {}) {
  const out = ['# Chalk retro digest', ''];
  const updates = store.updates().slice(-since);
  if (updates.length) {
    out.push('## Recent events');
    for (const u of updates) out.push(`- [${u.type}] ${u.title}${u.description ? ' — ' + u.description.slice(0, 140) : ''}`);
  }
  const findings = [];
  for (const t of store.tasks()) {
    const r = (t.reviews || []).slice(-1)[0];
    if (r && (r.findings || []).length) { findings.push(`- task "${t.title}" review ${r.verdict}:`); r.findings.forEach((f) => findings.push(`    - ${f.severity} ${f.area}: ${f.note}`)); }
    if (t.block) findings.push(`- task "${t.title}" BLOCKED — needs ${t.block.needs}: ${t.block.reason}`);
  }
  if (findings.length) { out.push('\n## Reviewer findings & blocks'); out.push(...findings); }
  let log = ''; try { log = execSync('git log --oneline -15', { cwd: store.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* not a repo */ }
  if (log.trim()) { out.push('\n## Recent commits'); out.push(log.trim()); }
  const lessons = store.lessons(25);
  if (lessons.length) { out.push('\n## Lessons already recorded (do NOT duplicate)'); out.push(...lessons); }
  return out.join('\n');
}

// Run the retro agent and parse its {lessons, issues} JSON. Times the call into the cost ledger.
export function runRetro(store) {
  const profile = resolveAgentRole(store.protocol(), 'retro');
  if (!profile?.command) return { status: 'unconfigured' };
  const digest = buildRetroDigest(store);
  const agentResult = runAgent('retro', {
    profile, cwd: store.root, context: digest, stderr: 'capture',
    failureOutput: 'combined', cost: { store },
  });
  const o = agentResult.structured;
  if (!o) return { status: 'error', raw: (agentResult.text || agentResult.diagnostics.map((d) => d.message).join('; ')).slice(-400) };
  return { status: 'ok', lessons: Array.isArray(o.lessons) ? o.lessons : [], issues: Array.isArray(o.issues) ? o.issues : [] };
}

// Loose title-similarity for dedup against open issues (normalized token Jaccard ≥ 0.6, or containment).
export function titlesSimilar(a, b) {
  const norm = (s) => String(s).toLowerCase().replace(/^\s*\w+(\([^)]*\))?:\s*/, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return false;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / new Set([...A, ...B]).size >= 0.6;
}
