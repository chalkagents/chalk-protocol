// Finish existing work through the run driver's live gates. Nothing here loads a
// saved receipt as execution authority; `verification` comes from this invocation.
import { spawnSync } from 'node:child_process';
import { workdir, depsSatisfied } from './store.mjs';
import { observeApproval, checkApproval, captureApproval } from './approval-inputs.mjs';
import { untrackedLockedTests } from './testgate.mjs';
import { canonicalCwd, assertStorage, streamIdentity, validateVerificationStreams, verificationIntegrityInputs } from './verification-record.mjs';

export function finishTarget(store, id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('run --finish requires a task ID');
  const tasks = store.tasks(), exact = tasks.find(task => task.id === id);
  const matches = exact ? [exact] : tasks.filter(task => task.id.startsWith(id));
  if (matches.length !== 1) throw new Error('run --finish requires one unambiguous existing task ID');
  const task = matches[0];
  if (task.state !== 'in-progress') throw new Error(`task is [${task.state}], not in-progress — run chalk start ${task.id}`);
  if (!depsSatisfied(task, tasks)) throw new Error('task prerequisites are incomplete — resolve dependencies before finishing');
  return task;
}

export function formatFinishTarget(store, task) {
  const cwd = canonicalCwd(workdir(store, task));
  const branch = spawnSync('git', ['--no-optional-locks', 'symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, encoding: 'utf8', timeout: 10000 });
  const base = task.reviewBase?.commit === null ? '(empty initial tree)' : task.reviewBase?.commit || '(not pinned; review preflight will resolve or refuse)';
  return `Finish task: ${task.id}\nExecution directory: ${JSON.stringify(cwd)}\nBranch: ${JSON.stringify(branch.status === 0 ? branch.stdout.trim() : '(detached or non-Git)')}\nTask base: ${base}`;
}

export function finishTrackingBlocker(store, task) {
  const untracked = untrackedLockedTests(store, task);
  return untracked.length ? `locked tests are not tracked in Git: ${untracked.join(', ')} — stage the tests before finishing` : null;
}

export function finishContractCurrent(store, task, initial) {
  const current = captureApproval(store, 'verification', task);
  if (initial?.status !== 'known' || current.status !== 'known') return { current: false, reason: 'initial or current verification contract is unknown' };
  // Stashing/restoring implementation files changes source metadata legitimately.
  // A fresh verify binds the restored source; it must not replace the contract,
  // gate configuration, visible locks, worktree or runtime being verified.
  const changed = ['specification', 'configuration', 'cwd', 'runtime'].filter(key => initial[key] !== current[key]);
  return changed.length ? { current: false, reason: `initial verification contract changed (${changed.join(', ')})` } : { current: true };
}

// Called inside the existing serialized completion transaction. Protect both the
// current source/contract and retained output through sequential checks and drain.
export function validateFinishVerification(store, task, verification, admit = () => {}) {
  const evidence = verification.evidence;
  if (!verification.green || !evidence?.receiptDigest) throw new Error('no successful live verification evidence — run again');
  const commands = [...verification.toolchain, ...(verification.e2e || []).map(item => item.execution).filter(Boolean)].filter(command => command.startedAt);
  const paths = [evidence.path, ...commands.flatMap(command => [command.stdoutPath, command.stderrPath])];
  const observation = observeApproval(store, 'verification', task, { evidence: paths.map(path => ({ path, storage: evidence.storage })) });
  try {
    assertStorage(evidence.dir, evidence.storage);
    if (streamIdentity(evidence.path).sha256 !== evidence.receiptDigest) throw new Error('verification receipt changed after execution');
    validateVerificationStreams(commands, evidence.storage);
    if (commands.some(command => command.retentionError || command.archiveError)) throw new Error('retained verification output is missing or changed');
    for (const input of verificationIntegrityInputs(store, workdir(store, task))) {
      if (store.brokenLocks(input, input.cwd).length) throw new Error('locked tests changed before completion — use chalk amend-spec');
    }
    const approval = checkApproval(store, 'verification', { approval: verification.approvals?.[task.id] }, task);
    if (!approval.current) throw new Error(approval.reason);
    admit();
    const fresh = observation.finish();
    if (!fresh.current) throw new Error(fresh.reason);
  } finally { observation.close(); }
}
