// Chalk Protocol — the event-log marker strings shared between the EMITTERS (run/handoff/done/
// audit) and the stats PARSER (lib/stats.mjs). `chalk stats` mines the event log by matching these
// strings; before this module each side hardcoded its own copy, so a reword at any emitter would
// have silently zeroed a stat. One source of truth, and the locked stats test exercises the real
// emitters end-to-end, so drift now fails a test instead of lying in a report.
export const HANDOFF_TITLE = (task) => `Handoff written: ${task.title}`;
export const HANDOFF_PREFIX = 'Handoff written';

export const BLOCKED_TITLE = (task, needs) => `Blocked: ${task.title} (needs ${needs})`;
export const BLOCKED_PREFIX = 'Blocked:';
// The two verify-RED block reasons the run loop writes (plain, and churn-escalated).
export const VERIFY_RED_REASON = 'verify RED after executor';
export const CHURN_REASON = (attempts) => `churn — ${attempts} attempts without a green verify; resume in a FRESH session`;
export const VERIFY_RED_MATCH = /verify RED|without a green verify/i;

export const REVIEW_OVERRIDE_TITLE = (task) => `Overrode review gate for "${task.title}"`;
// appendDecision prefixes 'Decision: ' when it emits the event.
export const REVIEW_OVERRIDE_EVENT_PREFIX = 'Decision: Overrode review gate for ';

export const AUDIT_TITLE = (green) => `Audit ${green ? 'green' : 'red'} (held-out regression)`;
export const AUDIT_GREEN_PREFIX = 'Audit green';
export const AUDIT_RED_PREFIX = 'Audit red';
