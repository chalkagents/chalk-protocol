// Chalk Protocol — handoff docs. The unattended executor already runs ONE fresh process per task
// (buildContext on stdin, no --resume), so context is minimal by task. The missing piece is what
// happens when a task DOESN'T finish in its session — it blocks, is set down by hand, or churns past
// its attempt budget. This writes a structured doc the NEXT session reads to pick up cleanly, instead
// of the ad-hoc HANDOVER-*.md a human used to hand-write. Template-first; an optional BYO agent
// (protocol.handoff.command, like review/retro) enriches the narrative. Zero deps beyond the spine.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { now, workdir } from './store.mjs';
import { changedPaths } from './git.mjs';
import { withRunner } from './config.mjs';

const REL_DIR = join('.chalk', 'handoffs');

// The most recent handoff record for a task ({ path, at, reason, seq }), or null. `path` is relative
// to store.root; the spine is single-canonical so this resolves from a worktree too.
export function latestHandoff(store, task) {
  return (task && task.handoff) || null;
}

// True when a task has burned through its attempt budget without reaching done — the signal to stop
// churning in a polluted context and hand off to a FRESH session. `attempts` is bumped per work run.
export function overAttemptBudget(store, task) {
  const max = store.protocol().handoff?.maxAttempts ?? 3;
  return (task.attempts || 0) >= max;
}

// Ask the optional BYO agent for a narrative (root cause / what's left / next action). Best-effort:
// any failure (no command, nonzero exit, timeout) falls back to template-only.
function narrate(store, task, reason, changed) {
  const cmd = store.protocol().handoff?.command;
  if (!cmd) return '';
  const prompt = [
    `Write the "Notes" section of a handoff doc for a coding task that did not finish in its session.`,
    `Be concise: root cause (if known), what is done, what is left, and the next concrete action.`,
    ``, `Task: ${task.title}`, `Reason handed off: ${reason}`,
    `Acceptance criteria:`, ...(task.acceptanceCriteria || []).map((c) => `- ${c.text}`),
    `Changed files:`, ...(changed.length ? changed.map((p) => `- ${p}`) : ['- (none)']),
  ].join('\n');
  try {
    return execSync(withRunner(store.protocol().runner, cmd), {
      cwd: workdir(store, task), input: prompt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10 * 60 * 1000,
    }).trim();
  } catch { return ''; }
}

function render(task, { reason, note, narrative, changed }) {
  const crit = (task.acceptanceCriteria || []).length
    ? (task.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c.text}`).join('\n') : '(none)';
  const files = changed.length ? changed.map((p) => `- ${p}`).join('\n') : '(no uncommitted changes)';
  const locked = (task.tests || []).length ? (task.tests).map((t) => `- ${t.path}`).join('\n') : '(none)';
  const notes = [note, narrative].filter(Boolean).join('\n\n') || '—';
  const short = task.id.slice(0, 12);
  return [
    `# Handoff — ${task.title}`, '',
    `- **Task:** ${task.id}`, `- **State:** ${task.state}`, `- **Generated:** ${now()}`, `- **Reason:** ${reason}`, '',
    `## Acceptance criteria`, crit, '',
    `## Changed files (working tree)`, files, '',
    `## Locked tests (read-only — do not edit; use \`chalk amend-spec\`)`, locked, '',
    `## Notes`, notes, '',
    `## Pickup — run in a FRESH session`, '```', `chalk context ${short}`, '```',
    `This handoff is included in that context. If the task isn't in-progress, resume with \`chalk start ${short}\`.`, '',
  ].join('\n');
}

// Write a handoff doc for a task and record the pointer on task.handoff. Returns the record.
// `reason` is why (manual | block | churn | <free text>); `note` is a human one-liner; `by` is the
// actor recorded on the update. Seq increments per task so prior handoffs are never overwritten.
export function writeHandoff(store, task, { reason = 'manual', note = '', by = 'agent' } = {}) {
  const changed = changedPaths(workdir(store, task));
  const narrative = narrate(store, task, reason, changed);
  const seq = ((task.handoff && task.handoff.seq) || 0) + 1;
  const rel = join(REL_DIR, `${task.id.slice(0, 12)}-${seq}.md`);
  const abs = join(store.root, rel);
  mkdirSync(join(store.root, REL_DIR), { recursive: true });
  writeFileSync(abs, render(task, { reason, note, narrative, changed }));

  const record = { path: rel, at: now(), reason, seq };
  task.handoff = record;
  store.upsertTask(task);
  store.emitUpdate({ type: 'progress-update', title: `Handoff written: ${task.title}`, description: `reason: ${reason}`, actorRole: by, taskId: task.id });
  return record;
}
