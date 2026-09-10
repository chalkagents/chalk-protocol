// The current contract stays small; previous definitions and invalidated approvals
// live in an append-only revision log. No completion state is changed here.
export function currentCriteria(task) {
  const criteria = structuredClone(task.acceptanceCriteria || []);
  const used = new Set(criteria.map(c => c.id).filter(Boolean));
  for (const revision of task.specRevisions || []) {
    for (const c of [...(revision.before?.acceptanceCriteria || []), ...(revision.after?.acceptanceCriteria || [])]) if (c.id) used.add(c.id);
  }
  let next = 1;
  return criteria.map(c => {
    if (c.id) return c;
    while (used.has(`ac-${next}`)) next++;
    const id = `ac-${next++}`; used.add(id);
    return { ...c, id };
  });
}

export function specificationEstablished(task) {
  return !['todo', 'specd'].includes(task.state) || !!(task.startedAt || task.criteriaAccepted || task.planApproved || task.reviews?.length || task.specRevisions?.some(r => r.kind === 'amendment'));
}

// Keep historical completion readable without lending it to a changed contract.
export const completionCurrent = task => task?.state === 'done' && !task.completionInvalidated && (task.completedSpecRevision === undefined || task.completedSpecRevision === (task.specRevision || 0));

const nonempty = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be non-empty text`);
  return value.trim();
};
const contract = task => ({ acceptanceCriteria: structuredClone(task.acceptanceCriteria || []), tests: structuredClone(task.tests || []) });

// Pure, all-or-nothing mutation. Call under Store.mutateTasks so concurrent
// amendments to the same task each see the latest revision, not a stale copy.
export function reviseSpecification(original, operations, { why, at, kind = 'amendment' }) {
  why = nonempty(why, '--why');
  if (!operations.length) throw new Error('no specification operation supplied');
  const task = structuredClone(original);
  task.acceptanceCriteria = currentCriteria(task);
  task.tests ||= [];
  const before = contract(task);
  const used = new Set([...task.acceptanceCriteria, ...(task.specRevisions || []).flatMap(r => [...(r.before?.acceptanceCriteria || []), ...(r.after?.acceptanceCriteria || [])])].map(c => c.id));
  for (const op of operations) {
    if (op.type === 'add') {
      let n = 1; while (used.has(`ac-${n}`)) n++;
      const id = `ac-${n}`; used.add(id);
      task.acceptanceCriteria.push({ id, text: nonempty(op.text, 'criterion') });
    } else if (op.type === 'replace' || op.type === 'retire') {
      if (!before.acceptanceCriteria.some(c => c.id === op.id)) throw new Error(`no current criterion ${op.id} — replace/retire IDs must exist before this amendment`);
      const index = task.acceptanceCriteria.findIndex(c => c.id === op.id);
      if (index < 0) throw new Error(`no current criterion ${op.id} — use chalk context to find its stable ID`);
      if (op.type === 'replace') task.acceptanceCriteria[index] = { ...task.acceptanceCriteria[index], text: nonempty(op.text, 'criterion') };
      else task.acceptanceCriteria.splice(index, 1);
    } else if (op.type === 'test') {
      const index = task.tests.findIndex(t => t.path === op.lock.path);
      if (index < 0) task.tests.push(structuredClone(op.lock));
      else task.tests[index] = structuredClone(op.lock);
    } else throw new Error(`unknown specification operation: ${op.type}`);
  }
  if (!task.acceptanceCriteria.length && !task.tests.length) throw new Error('cannot remove the entire established contract — retain a criterion or locked test');
  const revision = (task.specRevision ?? 0) + 1;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid specification revision');
  const invalidated = {};
  if (task.handoff) {
    invalidated.handoff = task.handoff;
    delete task.handoff;
  }
  if (task.state === 'done') {
    invalidated.completion = Object.fromEntries(['doneAt', 'completedSpecRevision', 'released', 'releasedAt', 'branch', 'worktree', 'pr', 'pipeline'].filter(key => task[key] !== undefined).map(key => [key, structuredClone(task[key])]));
    task.completionInvalidated = revision;
  }
  for (const key of ['criteriaAccepted', 'planApproved', 'plan']) {
    if (task[key]) { invalidated[key] = task[key]; delete task[key]; }
  }
  if (['pass', 'block'].includes(task.reviews?.at(-1)?.verdict)) {
    invalidated.review = task.reviews.at(-1);
    task.reviews.push({ at, by: 'amend-spec', verdict: 'stale', note: `specification revision ${revision}: ${why} — re-review required` });
  }
  // Preserve branch/commit/PR idempotency while forcing the verification stage to
  // run again. A fresh work execution clears this flag; a stage rank alone cannot.
  if (kind === 'amendment' || task.pipeline) task.pipeline = { ...(task.pipeline || {}), verificationInvalidated: revision, planInvalidated: revision };
  if (kind === 'amendment' && task.pr?.number) task.pipeline.publicationInvalidated = revision;
  task.specRevision = revision;
  task.specRevisions = [...(task.specRevisions || []), { revision, at, kind, why, operations: structuredClone(operations), before, after: contract(task), invalidated }];
  return task;
}
