// Chalk Protocol — the external verification gate (P4) + test-integrity check (P6/P7).
// "Done" can never rest on the agent's self-judgment; it rests on this returning green.
import { execSync } from 'node:child_process';
import { GATES, normGate, withRunner } from './config.mjs';
import { isSpec, runSpecs } from './e2e.mjs';

// Run the configured toolchain. Missing commands are SKIPPED (reported), not failed.
// `runner` (e.g. "fvm") is prepended to every gate command so config stays DRY.
// `mode` schedules gates: in 'task' mode a `when:'phase'` gate is DEFERRED (cheap checks every
// `chalk verify`, slow ones like a full build only at `chalk audit`); 'phase' mode runs all gates.
export function runToolchain(root, verifyConfig = {}, { runner = '', mode = 'task' } = {}) {
  const results = [];
  for (const gate of GATES) {
    const g = normGate(verifyConfig[gate]);
    if (!g.cmd) { results.push({ gate, status: 'skipped', cmd: null, when: g.when }); continue; }
    if (mode === 'task' && g.when === 'phase') { results.push({ gate, status: 'deferred', cmd: g.cmd, when: 'phase' }); continue; }
    const cmd = withRunner(runner, g.cmd);
    try {
      execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 10 * 60 * 1000 });
      results.push({ gate, status: 'pass', cmd, when: g.when });
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
      results.push({ gate, status: 'fail', cmd, when: g.when, tail: out.split('\n').slice(-12).join('\n') });
    }
  }
  return results;
}

// Full verify: toolchain + integrity of every in-progress task's locked tests.
// `cwd` is where the toolchain + e2e specs run (a task's git worktree in the pipeline, else the
// primary root). Integrity + locked specs are read from the same cwd so the agent's actual edits
// are what's checked.
export function verify(store, { mode = 'task', cwd = store.root } = {}) {
  const proto = store.protocol();
  const toolchain = runToolchain(cwd, proto.verify || {}, { runner: proto.runner, mode });

  const integrity = [];
  const specPaths = [];
  for (const task of store.tasks().filter((t) => t.state === 'in-progress')) {
    const broken = store.brokenLocks(task, cwd);
    if (broken.length) integrity.push({ taskId: task.id, title: task.title, broken });
    for (const t of task.tests || []) if (isSpec(t.path, proto.e2e?.specPattern)) specPaths.push(t.path);
  }
  // Opt-in all-locks integrity (#80): by default a task's lock protection expires at `done`, so a
  // later task can weaken an earlier done task's locked test to keep its own verify green (the
  // ImpossibleBench one-task-removed cheat). Under `integrity: "all-locks"`, hash every DONE task's
  // locked tests too — `amend-spec` stays the sanctioned change path. E2e specs are NOT re-run for
  // done tasks (they were already verified); only the hash is checked.
  if (proto.integrity === 'all-locks') {
    for (const task of store.tasks().filter((t) => t.state === 'done')) {
      const broken = store.brokenLocks(task, cwd);
      if (broken.length) integrity.push({ taskId: task.id, title: task.title, broken, done: true });
    }
  }

  // Browser-spec gate (P4 via real E2E replay) — only when an e2e runner is configured.
  const e2e = specPaths.length && proto.e2e?.command ? runSpecs(store, cwd, specPaths) : [];
  const e2eGreen = e2e.every((r) => r.status === 'passed');

  const toolchainGreen = toolchain.every((r) => r.status !== 'fail');
  const integrityGreen = integrity.length === 0;
  return { green: toolchainGreen && integrityGreen && e2eGreen, toolchain, integrity, e2e, toolchainGreen, integrityGreen, e2eGreen };
}
