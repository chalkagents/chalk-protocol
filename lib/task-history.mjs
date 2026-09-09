// Read historical contracts without depending on the Store or its mutation layer.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentCriteria } from './spec-revisions.mjs';

// All archived tasks, all years — so consumers (portal scope, audits) can see full history.
export function archivedTasks(store, { strict = false } = {}) {
  if (!store.root) return []; // lightweight embedding stores have no archive
  const dir = join(store.root, '.chalk', 'archive');
  let files = [];
  try { files = readdirSync(dir); } catch (error) {
    if (strict && error.code !== 'ENOENT') throw new Error('archived task history is unavailable — cannot admit a task write');
    return [];
  }
  const out = [];
  for (const f of files) {
    if (!/^tasks-\d{4}\.json$/.test(f)) continue;
    try {
      const records = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!Array.isArray(records) || records.some(task => !task || typeof task.id !== 'string')) throw new Error('invalid task records');
      out.push(...records);
    } catch {
      if (strict) throw new Error(`archived task history is unreadable (${f}) — reconcile history before admission`);
      // Display-only readers retain the legacy best-effort behavior.
    }
  }
  const latest = new Map();
  for (const task of out) {
    const previous = latest.get(task.id);
    if (!previous || (task.specRevision || 0) > (previous.specRevision || 0) || ((task.specRevision || 0) === (previous.specRevision || 0) && String(task.archivedAt || '') >= String(previous.archivedAt || ''))) latest.set(task.id, task);
  }
  return [...latest.values()];
}

// Live records may legitimately be newer after an interrupted archival attempt.
// An older or conflicting live contract must never override archived authority.
export function resolvedTaskHistory(store, live = store.tasks()) {
  const records = new Map(archivedTasks(store, { strict: true }).map(task => [task.id, task]));
  const contract = task => JSON.stringify({ criteria: currentCriteria(task), tests: task.tests || [] });
  for (const task of live) {
    const archived = records.get(task.id);
    if (archived && ((archived.specRevision || 0) > (task.specRevision || 0) || ((archived.specRevision || 0) === (task.specRevision || 0) && contract(archived) !== contract(task)))) throw new Error(`conflicting live/archive specification for ${task.id} — reconcile task history before admission`);
    records.set(task.id, task);
  }
  return [...records.values()];
}
