// Chalk Protocol — the external verification gate (P4) + test-integrity check (P6/P7).
// "Done" can never rest on the agent's self-judgment; it rests on this returning green.
import { execSync } from 'node:child_process';

const GATES = ['typecheck', 'lint', 'test', 'build']; // ordered cheapest→costliest

// Run the configured toolchain. Missing commands are SKIPPED (reported), not failed.
export function runToolchain(root, verifyConfig = {}) {
  const results = [];
  for (const gate of GATES) {
    const cmd = verifyConfig[gate];
    if (!cmd) { results.push({ gate, status: 'skipped', cmd: null }); continue; }
    try {
      execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 10 * 60 * 1000 });
      results.push({ gate, status: 'pass', cmd });
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
      results.push({ gate, status: 'fail', cmd, tail: out.split('\n').slice(-12).join('\n') });
    }
  }
  return results;
}

// Full verify: toolchain + integrity of every in-progress task's locked tests.
export function verify(store) {
  const toolchain = runToolchain(store.root, store.protocol().verify || {});

  const integrity = [];
  for (const task of store.tasks().filter((t) => t.state === 'in-progress')) {
    const broken = store.brokenLocks(task);
    if (broken.length) integrity.push({ taskId: task.id, title: task.title, broken });
  }

  const toolchainGreen = toolchain.every((r) => r.status !== 'fail');
  const integrityGreen = integrity.length === 0;
  return { green: toolchainGreen && integrityGreen, toolchain, integrity, toolchainGreen, integrityGreen };
}
