// Chalk Protocol — the Stakeholder portal model. The whole loop's state already lives in the spine
// (tasks, milestones, the update log); this maps it DETERMINISTICALLY to the Chalk Projects portal
// schema (scope items, milestones, updates, project meta) — the same shape the extract-portal-data
// skill scrapes from a codebase, but read from chalk's own structured data, so it's exact. `chalk
// portal` writes the files. Zero dependencies beyond the spine.
import { execSync } from 'node:child_process';
import { now } from './store.mjs';
import { archivedTasks } from './archive.mjs';

// The client-safe update `type` allow-list (portal schema). Events of any other type (internal noise
// like lessons or planning) are DROPPED — not relabeled — so neither their type nor their title/body
// can leak to a client.
const CLIENT_SAFE = new Set(['work-item-started', 'work-item-submitted', 'work-item-accepted', 'milestone-hit', 'contract-signed', 'addendum-opened', 'addendum-merged', 'decision-logged', 'question-answered', 'progress-update']);

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
const cleanTitle = (t) => String(t || '').replace(/^\s*[a-z]+(\([^)]*\))?!?:\s*/i, '').trim() || String(t || '');
const shortOf = (id) => String(id || '').replace(/^(task|evt|ms)-/, '').replace(/[^a-z0-9]/gi, '').slice(0, 8);

// chalk task state → portal scope state (the portal then maps delivered→done, approved→now (in
// progress), defined→next (agreed/queued) for the client view).
export function scopeState(taskState) {
  if (taskState === 'done') return 'delivered';
  if (taskState === 'in-progress') return 'approved';
  return 'defined';
}

function firstCommitDate(root) {
  try { return execSync('git log --reverse --format=%cs', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].trim() || undefined; }
  catch { return undefined; }
}

// Build the portal model from the spine. `slug` overrides the derived project slug; `since` bounds
// the update feed. Returns { slug, meta, scope, milestones, updates }.
export function portalModel(store, { slug, since = 40 } = {}) {
  const project = (store.meta() || {}).project || {};
  const pslug = slug || slugify(project.name);
  // Delivered history survives compaction: `chalk archive` moves released tasks out of the live
  // spine, but a client's portal must still show everything that shipped.
  const tasks = [...store.tasks(), ...archivedTasks(store)];

  const scope = tasks.map((t) => {
    const item = { id: `scope-${pslug}-${slugify(t.title).slice(0, 24)}`, slug: slugify(t.title), title: cleanTitle(t.title), state: scopeState(t.state) };
    const crit = (t.acceptanceCriteria || []).map((c) => ({ text: c.text })).filter((c) => c.text);
    if (crit.length) item.acceptanceCriteria = crit;
    if (t.released) item.verify = `Shipped in v${t.released}; pull the latest and confirm the acceptance criteria above.`;
    return item;
  });

  const names = [...new Set(tasks.map((t) => t.milestone).filter(Boolean))];
  const milestones = names.map((name) => {
    const mt = tasks.filter((t) => t.milestone === name);
    const done = mt.filter((t) => t.state === 'done').length;
    const status = done === mt.length ? 'completed' : done > 0 ? 'in-progress' : 'pending';
    const dates = mt.map((t) => t.doneAt || t.createdAt).filter(Boolean).sort();
    return { id: `ms-${pslug}-${slugify(name)}`, project: pslug, title: name, dueDate: String(dates[dates.length - 1] || now()).slice(0, 10), status };
  });

  const updates = store.updates().slice(-since).filter((u) => u && u.title && CLIENT_SAFE.has(u.type)).map((u) => {
    const evt = { id: `evt-${pslug}-${shortOf(u.id) || 'x'}`, project: pslug, type: u.type, title: u.title, at: u.at || now() };
    if (u.description) evt.description = u.description;
    evt.actorRole = u.actorRole || 'agent';
    return evt;
  });

  const meta = {};
  if (project.description || project.goal) meta.summary = project.description || project.goal;
  const started = firstCommitDate(store.root); if (started) meta.startedAt = started;

  return { slug: pslug, meta, scope, milestones, updates };
}
