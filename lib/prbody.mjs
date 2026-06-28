// Chalk Protocol — the PR "what was done" recording. The old PR body was just the acceptance criteria
// (the contract), not a record of the change. A human reviewing on GitHub (and the merge gate) needs
// to see what actually happened: a summary, a narrative, the files touched, the criteria satisfied,
// and the test plan. Template-first; an optional BYO protocol.prbody.command authors the narrative
// from the change, like handoff/review. Zero deps beyond the spine.
import { execSync } from 'node:child_process';
import { withRunner } from './config.mjs';
import { workdir } from './store.mjs';

// Ask the optional BYO agent to write the "What was done" narrative. Best-effort: no command, or any
// failure, returns '' and buildPrBody falls back to a structured default. `changed` is the file list.
export function prNarrative(store, task, changed = []) {
  const cmd = store.protocol().prbody?.command;
  if (!cmd) return '';
  const prompt = [
    `Write the "What was done" section of a pull-request body. 2-5 sentences, concrete and factual:`,
    `what changed and why, at the level a reviewer needs. No headings, no preamble.`,
    ``, `Task: ${task.title}`,
    `Acceptance criteria:`, ...(task.acceptanceCriteria || []).map((c) => `- ${c.text}`),
    `Changed files:`, ...(changed.length ? changed.map((p) => `- ${p}`) : ['- (none)']),
  ].join('\n');
  try {
    return execSync(withRunner(store.protocol().runner, cmd), {
      cwd: workdir(store, task), input: prompt, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10 * 60 * 1000,
    }).trim();
  } catch { return ''; }
}

// Build the PR body markdown. `changed` is the list of files the branch touches (committed diff vs
// base); `narrative` is the (optional) authored "what was done" — when empty, a structured default
// keeps the section meaningful rather than blank.
export function buildPrBody(store, task, { changed = [], narrative = '' } = {}) {
  const closes = task.issue?.number ? ` (closes #${task.issue.number})` : '';
  const whatDone = (narrative || '').trim()
    || `Implemented the change to satisfy the acceptance criteria below; see Changes for the files touched.`;
  const changes = changed.length ? changed.map((p) => `- \`${p}\``).join('\n') : '- (no file changes detected)';
  const crit = (task.acceptanceCriteria || []).length
    ? (task.acceptanceCriteria).map((c) => `- ${c.text}`).join('\n') : '- (none)';
  const locked = (task.tests || []).map((t) => `  - \`${t.path}\``).join('\n');

  const out = [];
  out.push('## Summary', `- ${task.title}${closes}`, '');
  out.push('## What was done', whatDone, '');
  out.push('## Changes', changes, '');
  out.push('## Acceptance criteria', crit, '');
  out.push('## Test plan', '- `chalk verify` green (toolchain + integrity + e2e)');
  if (locked) out.push('- locked tests:', locked);
  if (task.issue?.number) out.push('', `Closes #${task.issue.number}`);
  return out.join('\n');
}

// Merge-gate hook: a real recording exists. `chalk pr` sets task.pr.recorded once it has written a
// body documenting a non-empty change set.
export const hasRecording = (task) => task?.pr?.recorded === true;
