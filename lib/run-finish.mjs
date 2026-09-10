// Finish existing work through the run driver's live gates. Nothing here loads a
// saved receipt as execution authority; `verification` comes from this invocation.
import { spawnSync } from 'node:child_process';
import { workdir, depsSatisfied, pendingDirectives } from './store.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { observeApproval, checkApproval, captureApproval } from './approval-inputs.mjs';
import { untrackedLockedTests, looksLikeTest } from './testgate.mjs';
import { captureReviewInputs, legacyReviewBase } from './review-inputs.mjs';
import { changedPaths } from './git.mjs';
import { canonicalCwd, assertStorage, streamIdentity, validateVerificationStreams, verificationIntegrityInputs, digest } from './verification-record.mjs';
import { validateCurrentVerificationProvenance } from './verification-reuse.mjs';

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

const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const finishPolicyIdentity = store => digest(ordered(store.protocol()));
export const finishContextIdentity = (store, task) => digest(ordered({ directives: pendingDirectives(task),
  reviewBase: legacyReviewBase(workdir(store, task), task, store.protocol())?.commit ?? null }));

export function finishContractCurrent(store, task, initial, initialPolicy, initialContext) {
  if (finishPolicyIdentity(store) !== initialPolicy) return { current: false, reason: 'initial review/completion policy changed' };
  if (finishContextIdentity(store, task) !== initialContext) return { current: false, reason: 'director instructions or task review base changed during finish' };
  const current = captureApproval(store, 'verification', task);
  if (initial?.status !== 'known' || current.status !== 'known') return { current: false, reason: 'initial or current verification contract is unknown' };
  // Stashing/restoring implementation files changes source metadata legitimately.
  // A fresh verify binds the restored source; it must not replace the contract,
  // gate configuration, visible locks, worktree or runtime being verified.
  const changed = ['specification', 'configuration', 'cwd', 'runtime'].filter(key => initial[key] !== current[key]);
  return changed.length ? { current: false, reason: `initial verification contract changed (${changed.join(', ')})` } : { current: true };
}

// The existing adequacy helpers revert/mutate the working delta from HEAD, not
// the task base. Refuse an unsupported scope rather than silently skip commits.
export function finishProbeScope(store, task) {
  const proto = store.protocol();
  if (!proto.breakTest && !proto.mutation) return;
  const cwd = workdir(store, task), input = captureReviewInputs(cwd, task, proto);
  if (input.mode !== 'git') throw new Error('configured adequacy probes require an identifiable Git task delta');
  const implementation = path => !looksLikeTest(path) && !path.startsWith('.chalk/');
  const files = input.files.filter(implementation);
  if (changedPaths(cwd).filter(implementation).some(path => !files.includes(path))) throw new Error('working changes fall outside the task delta; configured adequacy probe scope is unsupported');
  const required = { breakTest: Boolean(proto.breakTest && files.length), mutation: Boolean(proto.mutation && files.length) };
  if (required.breakTest && !(task.tests || []).some(test => looksLikeTest(test.path) && existsSync(join(cwd, test.path)))) throw new Error('configured break-it probe has implementation changes but no runnable locked code test — add and lock a code test before finishing');
  if (!input.head || !files.length) return required;
  const result = spawnSync('git', ['--no-replace-objects', '--no-optional-locks', 'diff', '--quiet', '--no-ext-diff', '--no-textconv', input.base, input.head, '--', ...files.map(path => `:(literal)${path}`)], { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.status === 1) throw new Error('committed implementation changes are outside the supported working-tree adequacy probe scope; finish cannot certify these configured probes');
  if (result.status !== 0 || result.error) throw new Error('cannot establish configured adequacy probe scope');
  return required;
}

// Called inside the existing serialized completion transaction. Protect both the
// current source/contract and retained output through sequential checks and drain.
export function validateFinishVerification(store, task, verification, admit = () => {}) {
  const evidence = verification.evidence;
  if (!verification.green || !evidence?.receiptDigest) throw new Error('no successful verification evidence — run again');
  const commands = [...verification.toolchain, ...(verification.e2e || []).map(item => item.execution).filter(Boolean)].filter(command => command.startedAt);
  const paths = [evidence.path, ...commands.flatMap(command => [command.stdoutPath, command.stderrPath])];
  const observation = verification.admissionObservation || observeApproval(store, 'verification', task, { evidence: paths.map(path => ({ path, storage: evidence.storage })) });
  try {
    assertStorage(evidence.dir, evidence.storage);
    if (streamIdentity(evidence.path).sha256 !== evidence.receiptDigest) throw new Error('verification receipt changed after execution');
    validateVerificationStreams(commands, evidence.storage);
    if (commands.some(command => command.retentionError || command.archiveError)) throw new Error('retained verification output is missing or changed');
    if (verification.reused) validateCurrentVerificationProvenance(verification);
    for (const input of verificationIntegrityInputs(store, workdir(store, task))) {
      if (store.brokenLocks(input, input.cwd).length) throw new Error('locked tests changed before completion — use chalk amend-spec');
    }
    const approval = checkApproval(store, 'verification', { approval: verification.approvals?.[task.id] }, task);
    if (!approval.current) throw new Error(approval.reason);
    admit();
    if (verification.reused) validateCurrentVerificationProvenance(verification);
    const fresh = observation.finish();
    if (!fresh.current) throw new Error(fresh.reason);
  } finally { observation.close(); }
}
