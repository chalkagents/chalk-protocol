// Chalk Protocol — spine compaction. A long-lived project accretes hundreds of done tasks and tens
// of thousands of event lines (this repo's own tasks.json hit 134KB in three months), which slows
// every read, bloats every diff, and buries the live backlog. `chalk archive` moves the FINISHED
// history — tasks that are done AND released, plus their events — into .chalk/archive/, keeping the
// working spine small without deleting anything.
//
// Safety rules:
//   - only done+released tasks move (release idempotency is untouched: `chalk release` scans
//     done-WITHOUT-released, which is never archived);
//   - a task still referenced by a remaining task's `after` is KEPT (no dangling DAG edges, even
//     though the runtime tolerates them);
//   - events move only when their taskId belongs to an archived task — global events (decisions,
//     releases) stay in the live log;
//   - archive files are append-merged per year and remain plain JSON/JSONL (greppable, revertable).
// Zero dependencies beyond the spine.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { now, resolveRef } from './store.mjs';

const archDir = (root) => join(root, '.chalk', 'archive');
const tasksFile = (root, year) => join(archDir(root), `tasks-${year}.json`);
const updatesFile = (root, year) => join(archDir(root), `updates-${year}.jsonl`);

// All archived tasks, all years — so consumers (portal scope, audits) can see full history.
export function archivedTasks(store) {
  const dir = archDir(store.root);
  let files = [];
  try { files = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!/^tasks-\d{4}\.json$/.test(f)) continue;
    try { out.push(...JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* corrupt year file — skip, never crash a read path */ }
  }
  return out;
}

// Plan the compaction. Pure over the store's current state: returns { move, keep } where keep
// carries a human reason. A candidate is done+released; it stays if any REMAINING task's `after`
// resolves to it.
export function planArchive(store) {
  const tasks = store.tasks();
  const candidates = tasks.filter((t) => t.state === 'done' && t.released);
  const candidateIds = new Set(candidates.map((t) => t.id));
  const remaining = tasks.filter((t) => !candidateIds.has(t.id));
  const move = [], keep = [];
  for (const c of candidates) {
    const referencedBy = remaining.filter((r) => (r.after || []).some((ref) => resolveRef(tasks, ref)?.id === c.id));
    if (referencedBy.length) keep.push({ task: c, reason: `dep-referenced by ${referencedBy.map((r) => r.title).join(', ')}` });
    else move.push(c);
  }
  return { move, keep };
}

// Execute the compaction. Returns { archived, keptWithReason, events, files } (or the dry plan).
export function runArchive(store, { dryRun = false } = {}) {
  const { move, keep } = planArchive(store);
  if (!move.length) return { archived: [], keptWithReason: keep, events: 0, files: [] };
  if (dryRun) return { archived: move, keptWithReason: keep, events: countEvents(store, move), files: [], dryRun: true };

  const year = String(now()).slice(0, 4);
  mkdirSync(archDir(store.root), { recursive: true });

  // Tasks: append-merge into this year's archive file (idempotent on id).
  const tf = tasksFile(store.root, year);
  const prior = existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : [];
  const priorIds = new Set(prior.map((t) => t.id));
  writeFileSync(tf, JSON.stringify([...prior, ...move.filter((t) => !priorIds.has(t.id)).map((t) => ({ ...t, archivedAt: now() }))], null, 2) + '\n');

  // Events: move lines whose taskId belongs to an archived task; everything else stays live.
  const movedIds = new Set(move.map((t) => t.id));
  const updatesPath = join(store.root, '.chalk', 'updates.jsonl');
  const lines = existsSync(updatesPath) ? readFileSync(updatesPath, 'utf8').split('\n').filter(Boolean) : [];
  const stay = [], go = [];
  for (const line of lines) {
    let evt; try { evt = JSON.parse(line); } catch { stay.push(line); continue; } // never archive what we can't parse
    (evt.taskId && movedIds.has(evt.taskId) ? go : stay).push(line);
  }
  if (go.length) appendFileSync(updatesFile(store.root, year), go.join('\n') + '\n');
  writeFileSync(updatesPath, stay.length ? stay.join('\n') + '\n' : '');

  // Shrink the live spine last (after the archive files are safely written). Route through the locked
  // read-modify-write (#110) so a concurrent upsert isn't clobbered by archive's stale read.
  store.mutateTasks((tasks) => tasks.filter((t) => !movedIds.has(t.id)));
  store.emitUpdate({ type: 'progress-update', title: `Archived ${move.length} released task(s) to .chalk/archive/ (${go.length} event line(s))` });

  return { archived: move, keptWithReason: keep, events: go.length, files: [tf, go.length ? updatesFile(store.root, year) : null].filter(Boolean) };
}

function countEvents(store, move) {
  const ids = new Set(move.map((t) => t.id));
  const p = join(store.root, '.chalk', 'updates.jsonl');
  if (!existsSync(p)) return 0;
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).filter((l) => { try { return ids.has(JSON.parse(l).taskId); } catch { return false; } }).length;
}
