// Chalk Protocol — gate-efficacy stats (#78, harness-review finding 8: no self-measurement).
// Chalk never reported what its gates caught, so it couldn't prove its own value — to users or to
// us. `computeStats` is a PURE READ over the full history — the live spine (tasks.json +
// updates.jsonl) merged with the archive (.chalk/archive/tasks-*.json / updates-*.jsonl) — and
// distills three stories:
//   review efficacy — how often the adversarial reviewer blocked work that later passed (the
//     "catches"), and what the findings were about (severity × area);
//   churn — executor attempts, handoffs, and verify-RED blocks: the retry cost the gates made
//     visible instead of anecdotal;
//   gate-vs-bypass — of the DONE tasks, how many earned their landing (adversarial pass, pipeline
//     merge) vs went around the gates (override decision, no review, hand-landed). This is the
//     auditable fraction the dogfood loop reports on itself.
// Zero dependencies, never writes the spine.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { archivedTasks } from './archive.mjs';

// All archived event lines, all years — the JSONL counterpart of archivedTasks().
function archivedUpdates(store) {
  const dir = join(store.root, '.chalk', 'archive');
  let files = [];
  try { files = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const f of files.sort()) {
    if (!/^updates-\d{4}\.jsonl$/.test(f)) continue;
    try {
      for (const l of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (!l.trim()) continue;
        try { out.push(JSON.parse(l)); } catch { /* corrupt line — skip, never crash a read path */ }
      }
    } catch { /* unreadable year file — skip */ }
  }
  return out;
}

// Real gate verdicts only — `stale` (amend-spec invalidation) is bookkeeping, not a review.
const realReviews = (t) => (t.reviews || []).filter((r) => r.verdict === 'pass' || r.verdict === 'block');

export function computeStats(store, { since } = {}) {
  const cut = since ? Date.parse(since) : null;
  let tasks = [...archivedTasks(store), ...store.tasks()];
  let events = [...archivedUpdates(store), ...store.updates()];
  if (cut) {
    // Tasks are cut by when they FINISHED (a task done inside the window may carry older reviews —
    // they belong to its story); undone tasks are cut by creation. Events are cut by emission time.
    tasks = tasks.filter((t) => Date.parse(t.doneAt || t.createdAt || 0) >= cut);
    events = events.filter((e) => Date.parse(e.at || 0) >= cut);
  }

  // --- review gate: who got reviewed, who got caught, what the findings were about.
  const reviewed = tasks.filter((t) => realReviews(t).length);
  const caught = reviewed.filter((t) => {
    const rs = realReviews(t);
    return rs.some((r) => r.verdict === 'block') && rs[rs.length - 1].verdict === 'pass';
  });
  let blocks = 0, passes = 0;
  const bySeverity = {}, byArea = {};
  let findingsTotal = 0;
  for (const t of reviewed) {
    for (const r of realReviews(t)) {
      if (r.verdict === 'block') blocks++; else passes++;
      for (const f of r.findings || []) {
        findingsTotal++;
        if (f.severity) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        if (f.area) byArea[f.area] = (byArea[f.area] || 0) + 1;
      }
    }
  }

  // --- churn: attempts live on tasks; handoffs and verify-RED blocks live in the event log.
  const attempts = tasks.reduce((a, t) => a + (t.attempts || 0), 0);
  const worstChurn = tasks.filter((t) => (t.attempts || 0) > 1)
    .sort((a, b) => (b.attempts || 0) - (a.attempts || 0)).slice(0, 3)
    .map((t) => ({ id: t.id, title: t.title, attempts: t.attempts }));
  const handoffs = events.filter((e) => (e.title || '').startsWith('Handoff written')).length;
  const verifyRedBlocks = events.filter((e) => (e.title || '').startsWith('Blocked:')
    && /verify RED|without a green verify/i.test(e.description || '')).length;

  // --- gate-vs-bypass over DONE tasks. Gated = the last real verdict was an adversarial pass.
  // Overridden = a "Overrode review gate" decision names the task. Unreviewed = everything else —
  // done without the gate ever weighing in. Pipeline-landed = a PR that reached the merge+cleanup
  // stage (vs hand-landed commits, which skip the landing gate).
  const done = tasks.filter((t) => t.state === 'done');
  const overrideTitles = new Set(events
    .filter((e) => e.type === 'decision-logged' && (e.title || '').startsWith('Decision: Overrode review gate for '))
    .map((e) => e.title.slice('Decision: Overrode review gate for '.length).replace(/^"|"$/g, '')));
  const gated = done.filter((t) => realReviews(t).slice(-1)[0]?.verdict === 'pass');
  const overridden = done.filter((t) => !gated.includes(t) && overrideTitles.has(t.title));
  const unreviewed = done.filter((t) => !gated.includes(t) && !overridden.includes(t));
  const pipelineLanded = done.filter((t) => t.pr?.number && ['merged', 'cleaned'].includes(t.pipeline?.stage));

  // --- held-out audit runs (P7): green/red counts from the event log.
  const auditGreen = events.filter((e) => (e.title || '').startsWith('Audit green')).length;
  const auditRed = events.filter((e) => (e.title || '').startsWith('Audit red')).length;

  return {
    since: since || null,
    tasks: { total: tasks.length, done: done.length },
    review: {
      reviewed: reviewed.length,
      caught: caught.length,
      blocks,
      passes,
      findings: { total: findingsTotal, bySeverity, byArea },
    },
    churn: { attempts, worst: worstChurn, handoffs, verifyRedBlocks },
    landing: {
      done: done.length,
      gated: gated.length,
      overridden: overridden.length,
      unreviewed: unreviewed.length,
      pipelineLanded: pipelineLanded.length,
      handLanded: done.length - pipelineLanded.length,
    },
    audit: { green: auditGreen, red: auditRed },
  };
}
