// Cross-process verification reuse. A task reference only locates a candidate;
// the receipt, execution provenance, retained streams and current semantic inputs
// are independently revalidated before it can become completion authority.
import { lstatSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATES, normGate, withRunner } from './config.mjs';
import { isSpec } from './e2e.mjs';
import { checkApproval, observeApproval } from './approval-inputs.mjs';
import { workdir } from './store.mjs';
import { commandRequiresShell, commandWords, resolveCommand } from './process.mjs';
import { atomicWrite, canonicalCwd, digest, fileIdentity, inputsFresh, assertStorage, storageIdentity,
  validateVerificationStreams, verificationInputs } from './verification-record.mjs';

const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const HARNESS_FILES = ['verify.mjs', 'verification-command.mjs', 'verification-record.mjs', 'verification-reuse.mjs', 'e2e.mjs', 'config.mjs', 'process.mjs']
  .map(name => fileURLToPath(new URL(name, import.meta.url)));

function executableIdentity(command, env, cwd) {
  if (commandRequiresShell(command)) throw new Error('configured verification command requires shell interpretation');
  const [binary] = commandWords(command);
  if (!binary) throw new Error('configured verification command has no executable');
  const selected = resolveCommand(binary, { env });
  const selectedPath = resolve(cwd, selected);
  if (!lstatSync(selectedPath).isFile() && !lstatSync(selectedPath).isSymbolicLink()) throw new Error('verification executable is not a file');
  const actualPath = canonicalCwd(selectedPath);
  const inputs = Object.fromEntries(commandWords(command).slice(1).map(value => resolve(cwd, value)).filter(path => {
    try { return lstatSync(path).isFile(); } catch { return false; }
  }).sort().map(path => [path, fileIdentity(path)]));
  return { selectedPath, selected: fileIdentity(selectedPath), actualPath, actual: fileIdentity(actualPath), inputs };
}

export function captureVerificationProvenance(config, mode = 'task', env = process.env, cwd = process.cwd()) {
  try {
    const commands = [];
    for (const gate of GATES) {
      const normalized = normGate(config.verify?.[gate]);
      if (!normalized.cmd || mode === 'task' && normalized.when === 'phase') continue;
      const command = withRunner(config.runner, normalized.cmd);
      commands.push({ gate, command: digest(command), executable: executableIdentity(command, env, cwd) });
    }
    if (config.e2e?.command) {
      const command = withRunner(config.runner, config.e2e.command);
      commands.push({ gate: 'e2e', command: digest(command), executable: executableIdentity(command, env, cwd) });
    }
    const shellPath = process.platform === 'win32' ? (env.ComSpec || env.COMSPEC) : '/bin/sh';
    if (!shellPath) throw new Error('verification shell cannot be identified');
    return { version: 1, status: 'known', runtime: { node: process.version, platform: process.platform,
      arch: process.arch, execPath: canonicalCwd(process.execPath), exec: fileIdentity(process.execPath), versions: digest(ordered(process.versions)) },
    shell: executableIdentity(shellPath, env, cwd), environment: digest(ordered(env)),
    harness: Object.fromEntries(HARNESS_FILES.map(path => [path, fileIdentity(path)])), commands };
  } catch (error) { return { version: 1, status: 'unknown', reason: error.message }; }
}

export function verificationReuseInputs(inputs, provenance) {
  if (inputs?.source?.status !== 'known') return { version: 1, status: 'unknown', reason: inputs?.source?.error || 'source identity is unavailable' };
  const before = provenance?.before || provenance, after = provenance?.after || provenance;
  if (before?.status !== 'known' || after?.status !== 'known') return { version: 1, status: 'unknown', reason: before?.reason || after?.reason || 'execution provenance is unavailable' };
  if (digest(ordered(before)) !== digest(ordered(after))) return { version: 1, status: 'unknown', reason: 'toolchain or environment changed during execution' };
  if ((inputs.tasks || []).some(task => (task.dependencies || []).some(dependency => dependency.status !== 'resolved'))) {
    return { version: 1, status: 'unknown', reason: 'task dependency identity is unresolved' };
  }
  return { version: 1, status: 'known', source: digest({ method: inputs.source.method, files: inputs.source.files }),
    tests: inputs.integrityDigest, dependencies: digest((inputs.tasks || []).map(task => ({ id: task.id, dependencies: task.dependencies || [] }))),
    tasks: inputs.tasksDigest, configuration: inputs.configDigest, execution: digest(ordered(after)) };
}

export function validateCurrentVerificationProvenance(verification) {
  const before = verification.provenance?.before, after = verification.provenance?.after;
  if (before?.status !== 'known' || after?.status !== 'known') throw new Error('verification execution provenance is unknown');
  if (digest(ordered(before)) !== digest(ordered(after))) throw new Error('verification toolchain or environment changed during execution');
  const current = captureVerificationProvenance(verification.before?.config || {}, verification.mode, process.env, verification.cwd);
  if (current.status !== 'known' || digest(ordered(after)) !== digest(ordered(current))) throw new Error('verification toolchain or environment is stale or unavailable');
}

const referenceDir = store => join(store.root, '.chalk/local/verification-references');
const referencePath = (store, taskId) => join(referenceDir(store), `${digest(taskId)}.json`);

export function saveVerificationReferences(store, record, evidence) {
  if (record.mode !== 'task' || !validHash(evidence.receiptDigest)) return;
  const dir = referenceDir(store); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const storage = storageIdentity(dir);
  for (const task of record.before?.tasks || []) {
    const path = referencePath(store, task.id);
    try {
      const current = JSON.parse(readFileSync(path, 'utf8'));
      if (validTime(current.startedAt) && (Date.parse(current.startedAt) > Date.parse(record.startedAt) ||
          current.startedAt === record.startedAt && current.receiptId !== record.id && current.receiptId > record.id)) continue;
    } catch { /* an absent or malformed locator has no authority over this attempt */ }
    const reference = { version: 1, taskId: task.id, receiptId: record.id, receiptDigest: evidence.receiptDigest,
      startedAt: record.startedAt, status: record.status, ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}) };
    atomicWrite(path, JSON.stringify(reference, null, 2) + '\n', storage);
  }
}

function validateCommand(command, evidence, expectedCommand) {
  if (!command || command.status !== 'pass' || command.exitCode !== 0 || command.errorCode || command.signal || command.outputComplete !== true ||
      !validTime(command.startedAt) || !validTime(command.finishedAt) || Date.parse(command.finishedAt) < Date.parse(command.startedAt) ||
      command.cmd !== expectedCommand || command.archiveError || command.retentionError) throw new Error('receipt has incomplete or unsuccessful command provenance');
  for (const stream of ['stdout', 'stderr']) {
    const path = command[`${stream}Path`];
    if (typeof path !== 'string' || canonicalCwd(dirname(path)) !== canonicalCwd(evidence.dir) || !command.streams?.[stream] ||
        !Number.isSafeInteger(command.streams[stream].bytes) || command.streams[stream].bytes < 0 || !validHash(command.streams[stream].sha256)) {
      throw new Error('receipt has malformed retained stream provenance');
    }
  }
}

function validateExecution(record, evidence, streams = true) {
  if (!Array.isArray(record.toolchain) || record.toolchain.length !== GATES.length) throw new Error('receipt has incomplete toolchain results');
  for (const [index, gate] of GATES.entries()) {
    const command = record.toolchain[index], normalized = normGate(record.before.config.verify?.[gate]);
    if (command?.gate !== gate) throw new Error('receipt toolchain order is malformed');
    if (!normalized.cmd) { if (command.status !== 'skipped' || command.startedAt) throw new Error('unconfigured gate has forged execution'); continue; }
    if (record.mode === 'task' && normalized.when === 'phase') { if (command.status !== 'deferred' || command.startedAt) throw new Error('deferred gate has forged execution'); continue; }
    validateCommand(command, evidence, withRunner(record.before.config.runner, normalized.cmd));
  }
  const expectedSpecs = (record.before.integrityInputs || []).filter(input => input.state === 'in-progress')
    .flatMap(input => input.tests || []).map(test => test.path).filter(path => isSpec(path, record.before.config.e2e?.specPattern));
  if (!Array.isArray(record.e2e) || record.e2e.length !== (record.before.config.e2e?.command ? expectedSpecs.length : 0)) throw new Error('receipt has incomplete browser-spec results');
  for (const [index, spec] of record.e2e.entries()) {
    if (spec?.path !== expectedSpecs[index] || spec.status !== 'passed' || typeof spec.runDir !== 'string') throw new Error('receipt has malformed browser-spec result');
    const base = record.before.config.e2e?.baseUrl ? ` --base-url ${record.before.config.e2e.baseUrl}` : '';
    const expected = `${withRunner(record.before.config.runner, record.before.config.e2e.command)} --spec ${spec.path} --out ${spec.runDir}${base}`;
    validateCommand(spec.execution, evidence, expected);
  }
  const commands = [...record.toolchain, ...record.e2e.map(spec => spec.execution)].filter(command => command?.startedAt);
  if (streams) {
    validateVerificationStreams(commands, evidence.storage);
    if (commands.some(command => command.archiveError || command.retentionError)) throw new Error('retained verification output is missing or changed');
  }
  return commands;
}

function requireLatestAttempt(store, task, candidate) {
  const base = join(store.root, '.chalk/local/verification'), started = Date.parse(candidate.startedAt);
  const modified = (dir, path) => {
    let value = lstatSync(dir).mtimeMs;
    try { value = Math.max(value, lstatSync(path).mtimeMs); } catch { /* missing receipt remains uncertain at the directory time */ }
    return value;
  };
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.name === candidate.id) continue;
    const dir = join(base, entry.name), path = join(dir, 'run.json');
    if (!entry.isDirectory()) {
      if (modified(dir, path) >= started) throw new Error('newer verification storage is untrusted');
      continue;
    }
    try {
      const record = JSON.parse(readFileSync(path, 'utf8'));
      if (record?.cwd !== candidate.cwd || !(record.before?.tasks || []).some(item => item?.id === task.id)) continue;
      if (!validTime(record.startedAt)) throw new Error('matching verification attempt has unknown time');
      if (Date.parse(record.startedAt) > started || record.startedAt === candidate.startedAt && record.id !== candidate.id && record.id > candidate.id) {
        throw new Error('a newer verification attempt supersedes this receipt');
      }
    } catch (error) {
      if (/supersedes|unknown time/.test(error.message)) throw error;
      if (modified(dir, path) >= started) throw new Error('newer verification evidence is malformed or unavailable');
    }
  }
}

export function loadReusableVerification(store, task) {
  let admission;
  try {
    const pointer = referencePath(store, task.id);
    if (!lstatSync(pointer).isFile()) throw new Error('verification reference is not a regular file');
    const reference = JSON.parse(readFileSync(pointer, 'utf8'));
    if (reference.version !== 1 || reference.taskId !== task.id || !/^[a-f0-9-]{36}$/.test(reference.receiptId || '') ||
        !validHash(reference.receiptDigest) || !validTime(reference.startedAt)) throw new Error('verification reference is malformed');
    const dir = join(store.root, '.chalk/local/verification', reference.receiptId), path = join(dir, 'run.json');
    if (!lstatSync(path).isFile()) throw new Error('verification receipt is not a regular file');
    const bytes = readFileSync(path);
    if (digest(bytes) !== reference.receiptDigest) throw new Error('verification receipt changed after execution');
    const record = JSON.parse(bytes);
    if (record.version !== 1 || record.id !== reference.receiptId || record.startedAt !== reference.startedAt || record.cwd !== canonicalCwd(workdir(store, task)) || record.mode !== 'task' ||
        record.status !== 'complete' || record.green !== true || record.freshness !== 'fresh' || !validTime(record.startedAt) || !validTime(record.finishedAt) ||
        Date.parse(record.finishedAt) < Date.parse(record.startedAt) || record.toolchainGreen !== true || record.integrityGreen !== true ||
        record.integrityChecked !== true || record.e2eGreen !== true || inputsFresh(record.before, record.after) !== 'fresh') throw new Error('verification receipt is malformed, incomplete or unsuccessful');
    requireLatestAttempt(store, task, record);
    const evidence = { id: record.id, dir, path, storage: record.storage, receiptDigest: reference.receiptDigest };
    assertStorage(dir, evidence.storage);
    const commands = validateExecution(record, evidence, false);
    admission = observeApproval(store, 'verification', task, { evidence: [path, ...commands.flatMap(command => [command.stdoutPath, command.stderrPath])]
      .map(candidate => ({ path: candidate, storage: evidence.storage })) });
    validateExecution(record, evidence);
    validateCurrentVerificationProvenance(record);
    const currentInputs = verificationInputs(store, workdir(store, task));
    const currentProvenance = captureVerificationProvenance(currentInputs.config, record.mode, process.env, record.cwd);
    const currentReuse = verificationReuseInputs(currentInputs, currentProvenance);
    if (record.reuseInputs?.status !== 'known' || currentReuse.status !== 'known' || digest(record.reuseInputs) !== digest(currentReuse)) throw new Error('verification inputs are stale or unavailable');
    const approval = checkApproval(store, 'verification', { approval: record.approvals?.[task.id] }, task);
    if (!approval.current) throw new Error(approval.reason);
    return { verification: { ...record, evidence, reused: true, admissionObservation: admission }, reason: null };
  } catch (error) { admission?.close(); return { verification: null, reason: error.message }; }
}
