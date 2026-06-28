// Chalk Protocol — planner scoping questions. Planning is the human checkpoint: the planner should
// surface what it's UNSURE about (scope, product decisions, ambiguities) so a human validates before
// any code is written. The planner is BYO (claude -p), so rather than force a JSON contract we pull
// questions tolerantly from its plan text — a "## Questions" section and/or inline "Q:"/"QUESTION:"
// lines. `chalk plan` records them as open questions; `chalk approve-plan` gates work on them.
const Q_LINE = /^\s*(?:[-*]\s*|\d+[.)]\s*)?(?:Q\d*\s*[:.)]|QUESTION\s*[:.)])\s*(.+)$/i;
const BULLET = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;
const HEADING = /^#{1,6}\s*(.+?)\s*$/;
const QUESTION_HEADING = /^(open\s+|clarifying\s+|scoping\s+)?questions?\b/i;

// The plan-approval gate: when planning is required, work may not start until a human has approved
// the plan (after answering the scoping questions). Opt-in via protocol.plan.required, so existing
// flows are unaffected.
export function planApprovalRequired(store, task) {
  return !!store.protocol().plan?.required && !task.planApproved;
}

export function extractQuestions(planText) {
  if (!planText) return [];
  let inQ = false;
  const raw = [];
  for (const line of String(planText).split('\n')) {
    const h = line.match(HEADING);
    if (h) { inQ = QUESTION_HEADING.test(h[1]); continue; } // a heading toggles the questions section
    const marked = line.match(Q_LINE);
    if (marked) { raw.push(marked[1]); continue; }          // explicit Q:/QUESTION: anywhere
    if (inQ) { const b = line.match(BULLET); if (b) raw.push(b[1]); } // bullets under a Questions heading
  }
  const seen = new Set();
  const out = [];
  for (let q of raw) {
    q = q.replace(/^\[[ xX]\]\s*/, '').trim(); // strip a markdown checkbox prefix
    if (q && !seen.has(q)) { seen.add(q); out.push(q); }
    if (out.length >= 25) break; // sanity cap
  }
  return out;
}
