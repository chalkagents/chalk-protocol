// Chalk Protocol — plans projector. One-way bridge: tasks.json → canonical
// `.chalk/plans/<column>/NN_slug.plan.md`, the folder-kanban Chalk Browser reads
// (see chalk-browser/src/main/plans.ts). Protocol owns task state via its gates, so
// this projection is authoritative: each run rewrites ONLY the files it generated
// (marked `generator: chalk-protocol`) and leaves any hand-authored plans untouched.
// Zero dependencies — emits the small YAML-frontmatter subset plans.ts parses.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = 'chalk-protocol';
// Protocol task state → Browser kanban column (folder name under .chalk/plans/).
// `specd` (criteria attached, not started) still reads as "todo" on the board.
const STATE_COLUMN = { todo: 'todo', specd: 'todo', 'in-progress': 'inprogress', done: 'done' };
const COLUMN_DIRS = ['todo', 'inprogress', 'testing', 'done']; // PLAN_FOLDERS in plans.ts (+ root = unsorted)

// JSON double-quoted scalars are valid YAML — the safest zero-dep way to emit strings.
const y = (s) => JSON.stringify(String(s ?? ''));
const slugify = (title) =>
  (String(title || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)) || 'task';

function frontmatter(task) {
  const criteria = task.acceptanceCriteria || [];
  // Acceptance criteria aren't tracked per-item, so a task's criteria share its state:
  // done → all done (full progress bar), otherwise pending.
  const status = task.state === 'done' ? 'done' : 'pending';
  const overview = criteria.length ? criteria[0].text : 'No acceptance criteria yet.';
  const lines = [
    '---',
    `generator: ${MARKER}`,      // our ownership marker — only files carrying it are regenerated/removed
    `id: ${y(task.id)}`,          // stable identifier; survives renumbering (plans.ts frontmatter `id`)
    `name: ${y(task.title)}`,
    `overview: ${y(overview)}`,
  ];
  if (task.createdAt) lines.push(`created: ${y(task.createdAt)}`);
  if (criteria.length) {
    lines.push('todos:');
    criteria.forEach((c, i) => {
      lines.push(`  - id: ${y(`${task.id}-c${i + 1}`)}`);
      lines.push(`    content: ${y(c.text)}`);
      lines.push(`    status: ${status}`);
    });
  }
  lines.push('---');
  return lines.join('\n');
}

function body(task, phase) {
  const criteria = task.acceptanceCriteria || [];
  const tests = task.tests || [];
  const reviews = task.reviews || [];
  const out = [`# ${task.title}`, '', `> state: **${task.state}** · phase: ${phase || '—'}`, '', '## Objective', ''];
  out.push(criteria.length ? criteria.map((c) => `- ${c.text}`).join('\n') : '_No acceptance criteria yet._', '');
  if (tests.length) {
    out.push('## Locked tests (read-only — P6)', '');
    tests.forEach((t) => out.push(`- \`${t.path}\``));
    out.push('');
  }
  if (reviews.length) {
    out.push('## Reviews', '');
    reviews.forEach((r) => out.push(`- **${r.verdict}**${r.at ? ` · ${r.at.slice(0, 16)}` : ''}${r.by ? ` · ${r.by}` : ''}`));
    out.push('');
  }
  out.push('---', '_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._', '');
  return out.join('\n');
}

const isOurs = (content) => content.includes(`generator: ${MARKER}`);

// Project the current tasks into `.chalk/plans/`. Returns a summary {removed, written, plansDir}.
export function projectPlans(store) {
  const plansDir = join(store.root, '.chalk', 'plans');
  mkdirSync(plansDir, { recursive: true });

  // 1. Sweep out our previously-generated plans (across root + every column folder) so renames,
  //    reorders, state moves and deletions can't leave stragglers. Hand-authored plans (no marker)
  //    and non-plan files are left alone.
  let removed = 0;
  for (const dir of [plansDir, ...COLUMN_DIRS.map((d) => join(plansDir, d))]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.plan.md')) continue;
      const fp = join(dir, f);
      try { if (isOurs(readFileSync(fp, 'utf8'))) { rmSync(fp); removed++; } } catch { /* skip unreadable */ }
    }
  }

  // 2. Write the fresh projection. Global 1-based order keeps numeric prefixes unique across columns.
  const tasks = store.tasks();
  const phase = store.phase();
  const written = [];
  tasks.forEach((task, i) => {
    const column = STATE_COLUMN[task.state] || 'todo';
    const dir = join(plansDir, column);
    mkdirSync(dir, { recursive: true });
    const filename = `${String(i + 1).padStart(2, '0')}_${slugify(task.title)}.plan.md`;
    writeFileSync(join(dir, filename), `${frontmatter(task)}\n\n${body(task, phase)}`);
    written.push({ column, filename, title: task.title, state: task.state });
  });
  return { removed, written, plansDir };
}

// Best-effort projection for state-changing commands — never let a board refresh break a gate.
export function syncPlans(store) {
  try { return projectPlans(store); } catch { return null; }
}
