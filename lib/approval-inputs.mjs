// Shared semantic identities for approvals. These local records bind an actual
// gate result to its inputs; a matching digest alone is never an execution result.
import { lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, sep, dirname } from 'node:path';
import { homedir } from 'node:os';
import { workdir } from './store.mjs';
import { resolveAgentRole } from './config.mjs';
import { captureReviewInputs } from './review-inputs.mjs';
import { currentCriteria } from './spec-revisions.mjs';
import { resolvedTaskHistory } from './task-history.mjs';
import { canonicalCwd, digest, sourceIdentity, approvalSourceIdentity, refreshObservedSource, fileIdentity, directoryIdentity, verificationConfiguration, verificationIntegrityInputs, prepareVerificationOutputs } from './verification-record.mjs';
import { startVerificationMonitor } from './verification-command.mjs';

const contract = task => ({ id: task.id, title: task.title, revision: task.specRevision || 0, criteria: currentCriteria(task), tests: task.tests || [] });
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const hash = value => digest(ordered(value));
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sourceKinds = new Set(['review', 'audit', 'verification']);
const commands = { review: 'review', audit: 'audit', verification: 'verify', plan: 'approve-plan', alignment: 'align' };
export const approvalRecovery = (kind, task) => `chalk ${commands[kind]}${task && kind !== 'audit' && kind !== 'verification' ? ` ${task.id}` : ''}`;

function configuration(store, kind) {
  const proto = store.protocol();
  const gates = { ...verificationConfiguration(proto), requireTest: proto.requireTest, breakTest: proto.breakTest, mutation: proto.mutation };
  if (kind === 'alignment') return { director: proto.director };
  if (kind === 'plan') return { plan: proto.plan, planner: resolveAgentRole(proto, 'planner'), director: proto.director };
  if (kind === 'audit') { const { lastAudit, ...regression } = proto.regression || {}; return { gates, regression }; }
  if (kind === 'review') return { gates, review: proto.review, reviewer: resolveAgentRole(proto, 'reviewer'), base: proto.github?.base };
  return gates;
}

// A source scan excludes bookkeeping and held-out data. Visible locks outside the
// ordinary manifest remain explicit inputs and must never resolve into held-out paths.
function lockInputs(store, task, cwd) {
  const roots = [store.root, cwd].flatMap(root => [resolve(root, '.chalk/held-out'), resolve(root, String(store.protocol().regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir()))]).map(canonicalCwd);
  return (task?.tests || []).map(lock => {
    const path = canonicalCwd(resolve(cwd, lock.path));
    if (roots.some(root => path === root || path.startsWith(root + sep)) || path.split(sep).join('/').includes('/.chalk/held-out/')) throw new Error('visible approval input overlaps protected content');
    if (!lstatSync(path).isFile()) throw new Error('visible approval input is not a regular file');
    return { path: lock.path, actual: fileIdentity(path) };
  });
}

export function captureApproval(store, kind, task, { source, cwd = kind === 'audit' ? store.root : workdir(store, task) } = {}) {
  try {
    if (!Object.hasOwn(commands, kind)) throw new Error('unknown approval kind');
    const spec = { project: store.meta().project?.description || '', spec: store.spec?.() || '',
      contract: kind === 'audit' ? resolvedTaskHistory(store).map(contract).sort((a, b) => a.id.localeCompare(b.id)) : contract(task) };
    if (kind === 'review') spec.reviewBase = task.reviewBase || null;
    if (kind === 'review' && resolveAgentRole(store.protocol(), 'reviewer')?.command) {
      const candidate = captureReviewInputs(cwd, task, store.protocol());
      // Bind the semantic candidate, while permitting a commit or staging of
      // identical bytes. Capture also refuses ambiguous index/submodule inputs
      // at admission, including ambiguities introduced after a passing review.
      if (candidate.mode === 'git') spec.reviewCandidate = { base: candidate.base, files: candidate.files, content: candidate.contentFingerprint };
    }
    if (kind === 'plan') {
      spec.plan = task.plan || '';
      spec.questions = (store.questions?.() || []).filter(q => q.taskId === task.id);
    }
    if (kind === 'verification' || kind === 'review') spec.testPolicy = { labels: task?.labels || [], branchType: task?.branchType || '' };
    if (sourceKinds.has(kind)) {
      source ||= approvalSourceIdentity(cwd, store.protocol());
      if (source.status !== 'known') throw new Error(source.error || 'source identity unavailable');
      spec.visibleLocks = kind === 'audit' || kind === 'verification'
        ? verificationIntegrityInputs(store, cwd).filter(input => input.tests.length).map(({ id, cwd, tests }) => ({ id, cwd, tests }))
        : lockInputs(store, task, cwd);
    }
    return { version: 1, kind, status: 'known', specification: hash(spec), configuration: hash(configuration(store, kind)),
      // Between gates compare the effective manifest, not Git bookkeeping such
      // as registering an upstream during push. Within execution the observer
      // still protects policy files and detects temporary membership changes.
      ...(sourceKinds.has(kind) ? { source: hash({ method: source.method, files: source.files }), cwd: canonicalCwd(cwd), runtime: hash({ node: process.version, platform: process.platform, arch: process.arch }) } : {}) };
  } catch (error) { return { version: 1, kind, status: 'unknown', reason: error.message }; }
}

export function checkApproval(store, kind, record, task, options) {
  const recovery = approvalRecovery(kind, task), previous = record?.approval;
  if (!previous || previous.version !== 1 || previous.kind !== kind || previous.status !== 'known' ||
      !validHash(previous.specification) || !validHash(previous.configuration) ||
      sourceKinds.has(kind) && (!validHash(previous.source) || !validHash(previous.runtime) || typeof previous.cwd !== 'string')) return { current: false, reason: `${kind} approval is historical or has unknown inputs — run ${recovery}` };
  const currentTask = task && typeof store.task === 'function' ? store.task(task.id) : task;
  const current = captureApproval(store, kind, currentTask, options);
  if (current.status !== 'known') return { current: false, reason: `${kind} inputs cannot be identified (${current.reason}) — resolve inputs and run ${recovery}` };
  const changed = ['specification', 'configuration', 'source', 'cwd', 'runtime'].filter(key => previous[key] !== current[key]);
  return changed.length ? { current: false, reason: `${kind} approval is stale (${changed.join(', ')}) — run ${recovery}` } : { current: true };
}

export function requireCurrentApproval(store, kind, record, task, options) {
  const check = checkApproval(store, kind, record, task, options);
  if (!check.current) throw new Error(check.reason);
}

export function currentReview(store, task) {
  const current = typeof store.task === 'function' ? store.task(task.id) : task;
  const review = current?.reviews?.at(-1);
  return review?.verdict === 'pass' && checkApproval(store, 'review', review, current).current;
}

// Observe long-running approval work as well as checking endpoint identities.
// Canonical metadata may live outside the review worktree; protect it explicitly.
export function observeApproval(store, kind, task, { evidence = [] } = {}) {
  // The agent cost ledger is written after execution. Establish its bookkeeping
  // directory before observing the namespace of an absent visible-test tree.
  if (store.p?.cost) mkdirSync(dirname(store.p.cost), { recursive: true });
  const cwd = kind === 'audit' ? store.root : workdir(store, task), proto = store.protocol();
  if (kind === 'audit') prepareVerificationOutputs(store, cwd, proto);
  const source = sourceIdentity(cwd, proto);
  if (source.status !== 'known') throw new Error(source.error || 'source inputs are unavailable');
  const contractInputs = {};
  for (const path of [store.p?.tasks, store.p?.chalk, store.p?.spec].filter(Boolean)) {
    try { contractInputs[path] = fileIdentity(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; contractInputs[path] = 'deleted'; }
  }
  if (kind === 'audit') {
    // Archived contracts are excluded from the ordinary source manifest but are
    // authoritative for audit. Bind files and membership before reading history:
    // restored writes and create-use-delete archives must leave observation evidence.
    const archive = resolve(store.root, '.chalk/archive');
    let parent = archive;
    while (true) {
      const identity = directoryIdentity(parent);
      if (identity === 'not-directory') throw new Error('archive authority parent is not a directory');
      if (identity !== 'deleted') { source.namespaceInputs[parent] = identity; break; }
      if (dirname(parent) === parent) throw new Error('archive authority parent is unavailable');
      parent = dirname(parent);
    }
    if (parent === archive) for (const name of readdirSync(archive)) {
      if (!/^tasks-\d{4}\.json$/.test(name)) continue;
      const path = resolve(archive, name);
      if (!lstatSync(path).isFile()) throw new Error('archived contract is not a regular file');
      contractInputs[path] = fileIdentity(path);
    }
  }
  const approval = captureApproval(store, kind, task, { cwd, source });
  if (approval.status !== 'known') throw new Error(approval.reason || 'approval inputs are unavailable');
  // Git refreshes shared-index cache timestamps even on reads. Keep these writes
  // distinguishable from restored membership edits by requiring a normal index
  // before the nested Git reads in review preparation or phase verification.
  const sharedIndexes = Object.keys(source.sharedMetadata || {});
  if (sharedIndexes.length) throw new Error(`Git split-index cache writes prevent ${kind} observation (${sharedIndexes.slice(0, 3).join(', ')}) — run git update-index --no-split-index in the affected worktree or submodule, then ${approvalRecovery(kind, task)}`);
  const monitor = startVerificationMonitor(cwd, proto, { ...source, contractInputs });
  try { if (evidence.length) monitor.protect(evidence); }
  catch (error) { monitor.close(); throw error; }
  return { approval, close: () => monitor.close(), finish() {
    try {
      const check = checkApproval(store, kind, { approval }, task, { cwd, source: refreshObservedSource(cwd, source) });
      const observed = monitor.finish();
      if (observed.monitorError) return { current: false, reason: `${kind} input observation failed (${observed.monitorError}) — resolve inputs and run ${approvalRecovery(kind, task)}` };
      if (observed.evidenceChanges?.length) return { current: false, reason: `${kind} retained evidence changed during admission — run ${approvalRecovery(kind, task)}` };
      if (observed.inputChanges.length) return { current: false, reason: `source, configuration or specification changed during ${kind} (${observed.inputChanges.slice(0, 6).join(', ')}) — resolve inputs and run ${approvalRecovery(kind, task)}` };
      return check;
    } catch (error) { monitor.close(); return { current: false, reason: `${kind} inputs could not be observed (${error.message}) — run ${approvalRecovery(kind, task)}` }; }
  } };
}
