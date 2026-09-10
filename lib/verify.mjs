import { captureApproval, checkApproval } from './approval-inputs.mjs';
// Chalk Protocol — the external verification gate (P4) + test-integrity check (P6/P7).
// "Done" can never rest on the agent's self-judgment; it rests on this returning green.
import { openSync, closeSync, readSync, statSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runVerificationCommand, startVerificationMonitor } from './verification-command.mjs';
import { GATES, normGate, withRunner } from './config.mjs';
import { isSpec, runSpecs } from './e2e.mjs';
import { createVerificationRecord, saveVerificationRecord, verificationInputs, inputsFresh, validateVerificationStreams, storageIdentity, assertStorage } from './verification-record.mjs';

const tail = path => {
  const size = statSync(path).size, length = Math.min(size, 8192), fd = openSync(path, 'r');
  try { const b = Buffer.alloc(length); readSync(fd, b, 0, length, size - length); return b.toString('utf8'); }
  finally { closeSync(fd); }
};

// Run the configured toolchain. Missing commands are SKIPPED (reported), not failed.
// `runner` (e.g. "fvm") is prepended to every gate command so config stays DRY.
// `mode` schedules gates: in 'task' mode a `when:'phase'` gate is DEFERRED (cheap checks every
// `chalk verify`, slow ones like a full build only at `chalk audit`); 'phase' mode runs all gates.
export function runToolchain(root, verifyConfig = {}, { runner = '', mode = 'task', timeoutMs = 10 * 60 * 1000, runDir, receiptPath, storage, proto = {}, monitorSource, onResult = () => {} } = {}) {
  const results = [];
  const dir = runDir || join(root, '.chalk/local/verification', randomUUID());
  for (const gate of GATES) {
    const g = normGate(verifyConfig[gate]);
    if (!g.cmd) { results.push({ gate, status: 'skipped', cmd: null, when: g.when }); continue; }
    if (mode === 'task' && g.when === 'phase') { results.push({ gate, status: 'deferred', cmd: g.cmd, when: 'phase' }); continue; }
    const cmd = withRunner(runner, g.cmd);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    storage ||= storageIdentity(dir);
    const stdoutPath = join(dir, `${gate}.stdout.log`), stderrPath = join(dir, `${gate}.stderr.log`);
    onResult(results);
    const result = { ...runVerificationCommand({ cwd: root, gate, cmd, timeoutMs, stdoutPath, stderrPath, receiptPath, storage, proto, monitorSource }), when: g.when };
    if (result.status === 'fail') result.tail = `${tail(result.stdoutPath)}${tail(result.stderrPath)}`.trim().split('\n').slice(-12).join('\n');
    results.push(result); onResult(results);
  }
  return results;
}

// Full verify: toolchain + integrity of every in-progress task's locked tests.
// `cwd` is where the toolchain + e2e specs run (a task's git worktree in the pipeline, else the
// primary root). Integrity + locked specs are read from the same cwd so the agent's actual edits
// are what's checked.
export function verificationFailureReason(result, prefix = 'verification failed') {
  const reasons = [result.approvalError, result.evidenceError,
    result.freshness === 'stale' ? 'source, specification or configuration changed during verification'
      : result.freshness === 'unknown' ? 'verification inputs could not be observed' : ''].filter(Boolean);
  return `${prefix}${reasons.length ? ` — ${[...new Set(reasons)].join('; ')}` : ''} — run chalk verify`;
}

export function verify(store, { mode = 'task', cwd = store.root, preflightError } = {}) {
  let receipt, monitor, result;
  try {
    receipt = createVerificationRecord(store, cwd, mode);
    const { evidence, record } = receipt;
    // Callers that fail an enclosing observation still retain the ordinary
    // failed receipt, without launching any configured command.
    if (preflightError) throw new Error(preflightError);
    if (record.status === 'error') throw new Error(record.error);
    const approvals = Object.fromEntries(record.before.tasks.map(task => [task.id, captureApproval(store, 'verification', store.task(task.id), { cwd, source: record.before.source })]));
    const contractInputs = { ...record.before.authorityFiles };
    for (const task of record.before.integrityInputs) for (const test of task.tests) contractInputs[resolve(task.cwd, test.path)] = test.actual;
    const monitorSource = { ...record.before.source, contractInputs };
    monitor = startVerificationMonitor(cwd, record.before.config, monitorSource);
    result = performVerify(store, { mode, cwd, inputs: record.before, monitorSource, runDir: evidence.dir, receiptPath: evidence.path, storage: evidence.storage, onResult: toolchain => {
      record.toolchain = toolchain;
      saveVerificationRecord(evidence, record);
    } });
    const commands = [...result.toolchain, ...result.e2e.map(r => r.execution).filter(Boolean)];
    const executed = commands.filter(r => r.startedAt);
    validateVerificationStreams(executed, evidence.storage);
    monitor.protect(executed.flatMap(command => ['stdout', 'stderr'].map(stream => ({
      path: command[`${stream}Path`],
      storage: command[`${stream}Path`] === command.recovery?.[`${stream}Path`] ? command.recovery.storage : evidence.storage,
    }))));
    const after = verificationInputs(store, cwd, record.before.source);
    // Both source and archived streams remain observed throughout sequential validation.
    validateVerificationStreams(executed, evidence.storage);
    const { finishedAt, ...observation } = monitor.finish(); monitor = null;
    result.observation = observation; result.finishedAt = finishedAt;
    if (observation.evidenceChanges?.length) {
      for (const command of executed) for (const stream of ['stdout', 'stderr']) {
        if (observation.evidenceChanges.includes(command[`${stream}Path`])) {
          command.retentionError ||= `${command.gate} ${stream} archive changed during finalization`;
        }
      }
      // Damage detected at the boundary closes the gate permanently. Restore matching
      // received bytes where possible and keep recovery references in the failed receipt.
      validateVerificationStreams(executed, evidence.storage);
    }
    const evidenceError = commands.flatMap(r => [r.archiveError, r.retentionError]).filter(Boolean).join('; ');
    if (evidenceError) result.evidenceError = evidenceError;
    const freshness = observation.monitorError || commands.some(r => r.monitorError) ? 'unknown' : observation.inputChanges.length || commands.some(r => r.inputChanges?.length) ? 'stale' : inputsFresh(record.before, after);
    const approvalChecks = record.before.tasks.map(task => checkApproval(store, 'verification', { approval: approvals[task.id] }, task, { cwd, source: after.source }));
    const green = result.green && freshness === 'fresh' && !evidenceError && approvalChecks.every(check => check.current);
    result.approvals = approvals;
    result.approvalError = approvalChecks.find(check => !check.current)?.reason;
    const release = evidenceError ? [] : executed.filter(c => c.recovery).map(command => ({ command, recovery: command.recovery }));
    for (const { command } of release) delete command.recovery;
    Object.assign(record, { ...result, green, after, freshness, status: evidenceError ? 'error' : 'complete', finishedAt });
    try { saveVerificationRecord(evidence, record); }
    catch (error) { for (const { command, recovery } of release) command.recovery = recovery; throw error; }
    for (const { recovery } of release) { try { assertStorage(recovery.dir, recovery.storage); rmSync(recovery.dir, { recursive: true, force: true }); } catch { /* retained temporary copies do not invalidate durable archives */ } }
    return { ...result, green, evidence, freshness };
  } catch (e) {
    monitor?.close();
    if (receipt) {
      // A supervisor may have persisted newer command outcomes before a parent-side failure.
      try {
        assertStorage(receipt.evidence.dir, receipt.evidence.storage);
        const latest = JSON.parse(readFileSync(receipt.evidence.path, 'utf8'));
        if (latest.id === receipt.record.id) for (const key of ['toolchain', 'browserCommands']) {
          const current = receipt.record[key] || [];
          for (const item of latest[key] || []) {
            const index = current.findIndex(g => g.gate === item.gate);
            if (index < 0) current.push(item);
            else if (!current[index].finishedAt && item.finishedAt || !current[index].finishedAt && item.status === 'running') current[index] = item;
          }
          receipt.record[key] = current;
        }
      } catch { /* retain the in-memory record if storage is unavailable */ }
      Object.assign(receipt.record, { status: 'error', green: false, error: e.message, finishedAt: new Date().toISOString() });
      try { saveVerificationRecord(receipt.evidence, receipt.record); } catch { /* original storage error remains authoritative */ }
    }
    return { ...result, green: false, toolchain: receipt?.record.toolchain || [], integrity: result?.integrity || [],
      e2e: result?.e2e || [], browserCommands: receipt?.record.browserCommands || [],
      toolchainGreen: result?.toolchainGreen ?? false, integrityGreen: result?.integrityGreen ?? true,
      integrityChecked: result?.integrityChecked ?? false, e2eGreen: result?.e2eGreen ?? true,
      evidence: receipt?.evidence, evidenceError: e.message, freshness: 'unknown' };
  }
}

function performVerify(store, { mode, cwd, inputs, monitorSource, runDir, receiptPath, storage, onResult }) {
  const proto = inputs.config;
  const toolchain = runToolchain(cwd, proto.verify || {}, { runner: proto.runner, mode, runDir, receiptPath, storage, proto, monitorSource, onResult });

  const integrity = [];
  const specPaths = [];
  for (const task of inputs.integrityInputs.filter((t) => t.state === 'in-progress')) {
    // Scope P6 per task (#110): hash each in-progress task's locked tests in ITS OWN worktree, not a
    // single shared cwd. Worktrees isolate the EDITS but a shared-cwd integrity check does not — a
    // second in-progress task on its own branch is missing the first's locked test (or carries a
    // stale sha) in this checkout, firing a false break and forcing whole-repo sequential sweeps.
    // workdir() falls back to store.root, so the common single-task case (worktree == cwd) is unchanged.
    const broken = store.brokenLocks(task, task.cwd);
    if (broken.length) integrity.push({ taskId: task.id, title: task.title, broken });
    for (const t of task.tests || []) if (isSpec(t.path, proto.e2e?.specPattern)) specPaths.push(t.path);
  }
  // Opt-in all-locks integrity (#80): by default a task's lock protection expires at `done`, so a
  // later task can weaken an earlier done task's locked test to keep its own verify green (the
  // ImpossibleBench one-task-removed cheat). Under `integrity: "all-locks"`, hash every DONE task's
  // locked tests too — `amend-spec` stays the sanctioned change path. E2e specs are NOT re-run for
  // done tasks (they were already verified); only the hash is checked.
  if (proto.integrity === 'all-locks') {
    for (const task of inputs.integrityInputs.filter((t) => t.state === 'done')) {
      const broken = store.brokenLocks(task, cwd);
      if (broken.length) integrity.push({ taskId: task.id, title: task.title, broken, done: true });
    }
  }

  // Browser-spec gate (P4 via real E2E replay) — only when an e2e runner is configured.
  let specIndex = 0;
  const e2e = specPaths.length && proto.e2e?.command ? runSpecs(store, cwd, specPaths, { protocol: proto, execute: cmd => {
    const gate = `e2e-${specIndex++}`;
    return runVerificationCommand({ cwd, gate, cmd, stdoutPath: join(runDir, `${gate}.stdout.log`), stderrPath: join(runDir, `${gate}.stderr.log`), receiptPath, storage, section: 'browserCommands', proto, monitorSource });
  } }) : [];
  const e2eGreen = e2e.every((r) => r.status === 'passed');

  const toolchainGreen = toolchain.every((r) => r.status !== 'fail');
  const integrityGreen = integrity.length === 0;
  return { green: toolchainGreen && integrityGreen && e2eGreen, toolchain, integrity, e2e, toolchainGreen, integrityGreen, integrityChecked: true, e2eGreen };
}
