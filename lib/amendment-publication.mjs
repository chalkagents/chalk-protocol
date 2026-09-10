// Existing PRs must carry the current committed candidate to their remote branch.
// Stage rank and an old green CI result cannot prove publication.
import { git, changedPaths } from './git.mjs';
import { workdir } from './store.mjs';

const quote = text => `'${String(text).replace(/'/g, `'"'"'`)}'`;
export const amendedPr = task => !!task.pr?.number && !!task.specRevisions?.some(r => r.kind === 'amendment');

function candidate(store, task) {
  const cwd = workdir(store, task);
  if (!task.branch) throw new Error('PR has no branch — restore its branch before chalk pr');
  const dirty = changedPaths(cwd).filter(p => !p.startsWith('.chalk/') || p.startsWith('.chalk/evidence/') || p.startsWith('.chalk/tests/'));
  if (dirty.length) throw new Error('PR has uncommitted code — run chalk commit, then chalk pr');
  return { cwd, head: git(cwd, 'rev-parse HEAD'), ref: `refs/heads/${task.branch}` };
}

export function amendmentPublication(store, task) {
  if (!amendedPr(task)) return { ok: true, required: false };
  return prPublication(store, task);
}

function prPublication(store, task) {
  try {
    const { cwd, head, ref } = candidate(store, task);
    const remote = git(cwd, `ls-remote --exit-code origin ${quote(ref)}`, { timeout: 15000 }).split(/\s/)[0];
    return { ok: remote === head, required: true, head, detail: remote === head ? 'current commit is on the PR branch' : 'PR branch is behind or different — run chalk pr before merge' };
  } catch (error) { return { ok: false, required: true, detail: `${error.message}; inspect the branch and retry chalk pr` }; }
}

export function publishPrCandidate(store, task) {
  const { cwd, head, ref } = candidate(store, task);
  // Push the actual committed candidate, not a potentially different local ref.
  // Normal fast-forward push only: divergent remote work is never overwritten.
  git(cwd, `push origin ${quote(`${head}:${ref}`)}`);
  const publication = prPublication(store, task);
  if (!publication.ok || publication.head !== head) throw new Error(publication.detail || 'candidate changed during publication — retry chalk pr');
  return publication;
}

export const publishAmendedPr = publishPrCandidate;
