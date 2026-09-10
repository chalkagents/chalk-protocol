// Required audit approvals belong to the contract they examined. Keep historical
// tasks in the identity so archival alone cannot invalidate that approval.
import { createHash } from 'node:crypto';
import { resolvedTaskHistory } from './task-history.mjs';
import { currentCriteria } from './spec-revisions.mjs';

function contracts(store) {
  return resolvedTaskHistory(store).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
export function auditSpecificationDigest(store) {
  const records = contracts(store).map(task => ({ id: task.id, revision: task.specRevision || 0, criteria: currentCriteria(task), tests: task.tests || [] }));
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
export function auditApprovalCurrent(store, audit = store.protocol().regression?.lastAudit) {
  if (!audit?.green) return false;
  if (typeof audit.specificationDigest === 'string') return audit.specificationDigest === auditSpecificationDigest(store);
  // Legacy audits remain compatible only until a sanctioned amendment exists.
  // Without a recorded identity they cannot accept any amended contract.
  return !contracts(store).some(task => task.specRevisions?.some(revision => revision.kind === 'amendment'));
}
