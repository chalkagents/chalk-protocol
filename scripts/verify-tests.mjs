// Keep process-startup conformance and lock-entry probes out of the concurrent pool.
// Both batches are mandatory; this schedules the suite without skipping assertions.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERIAL_TESTS = new Set([
  'test/codex-gemini-adapters.test.mjs',
  'test/spec-release.test.mjs',
]);
const requiresSerialExecution = file => file.includes('conformance') ||
  file.startsWith('test/verification-') || SERIAL_TESTS.has(file);
const integrationPriority = file => Number(file === 'test/pipeline.test.mjs');

export function runVerificationTests({ root = ROOT, launch = spawnSync } = {}) {
  const files = [];
  const unknown = () => { throw new Error('unrecognized test layout; update complete-suite discovery before verification'); };
  // Empty fixture directories are harmless. Discover nested tests, but refuse
  // unfamiliar files or protected trees rather than silently omit new tests.
  const walk = relative => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (['.chalk', '.git', 'node_modules'].includes(entry.name)) unknown();
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(file);
      else unknown();
    }
  };
  walk('test'); if (!files.length) unknown(); files.sort();
  // Start the long end-to-end pipeline before short files occupy its worker.
  // This avoids a late serial tail without increasing concurrency or the deadline.
  const concurrentFiles = files.filter(file => !requiresSerialExecution(file));
  concurrentFiles.sort((a, b) => integrationPriority(b) - integrationPriority(a) || a.localeCompare(b));
  for (const [concurrency, batch] of [[1, files.filter(requiresSerialExecution)], [4, concurrentFiles]]) {
    if (!batch.length) continue;
    // A caller may itself be a test child. Do not let that private Node marker
    // turn an explicit new verification process into an empty recursive run.
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const result = launch(process.execPath, [`--test-concurrency=${concurrency}`, join(ROOT, 'scripts/verify-test-batch.mjs'), String(concurrency), ...batch], { cwd: root, stdio: 'inherit', env });
    if (result.error || result.signal || result.status !== 0) return result.status || 1;
  }
  return 0;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = runVerificationTests();
