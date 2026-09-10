// Serialize the entire release side effect with sanctioned task amendments.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completionCurrent } from './spec-revisions.mjs';
import { resolvedTaskHistory } from './task-history.mjs';

export function withReleaseAdmission(store, operation) {
  return store.withLock(() => {
    // Nested spine writes belong to this transaction. Other processes still use
    // the real lock; the facade exists only for this synchronous operation.
    const transaction = Object.create(store);
    transaction.withLock = action => action();
    return operation(transaction);
  }, { protectOwner: true });
}
const recordPath = (store, version) => join(store.root, '.chalk', 'local', 'releases', `${createHash('sha256').update(version).digest('hex')}.json`);
const contract = task => ({ id: task.id, revision: task.specRevision || 0 });
function check(store, record) {
  if (record?.version !== 1 || !Array.isArray(record.tasks) || !record.tasks.length) throw new Error('release recovery contract is incomplete — cannot resume safely');
  const tasks = new Map(resolvedTaskHistory(store).map(task => [task.id, task]));
  for (const expected of record.tasks) {
    const task = tasks.get(expected.id);
    if (!completionCurrent(task) || (task.specRevision || 0) !== expected.revision) throw new Error(`release specification changed for ${expected.id} — cannot resume the prior release candidate; its contract must be reconciled before publication`);
  }
}
export function recordReleaseContract(store, version, tasks) {
  const path = recordPath(store, version), records = tasks.map(contract);
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8')); check(store, previous);
    if (JSON.stringify(previous.tasks) !== JSON.stringify(records)) throw new Error('release candidate changed since the interrupted attempt — inspect that release before starting another');
    return;
  }
  const record = { version: 1, releaseVersion: version, tasks: records }; check(store, record);
  mkdirSync(join(store.root, '.chalk', 'local', 'releases'), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
}
export function checkReleaseRecovery(store, version) {
  const path = recordPath(store, version);
  if (existsSync(path)) return check(store, JSON.parse(readFileSync(path, 'utf8')));
  if (resolvedTaskHistory(store).some(task => task.specRevisions?.some(revision => revision.kind === 'amendment'))) throw new Error('legacy release has no contract identity for amended tasks — cannot resume publication safely');
}
