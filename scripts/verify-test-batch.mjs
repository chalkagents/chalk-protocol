// Explicit files preserve the caller's schedule; Node's CLI alphabetizes them.
import { spawnSync } from 'node:child_process';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
const concurrency = Number(process.argv[2]), files = process.argv.slice(3);
if (!Number.isInteger(concurrency) || concurrency < 1 || !files.length) throw new Error('verification batch requires concurrency and test files');

// Stateful filesystem tests need a fresh runner as well as concurrency=1. A single
// long-lived node:test coordinator can retain platform watcher resources between
// files even after each test child exits, eventually making later observers fail.
if (concurrency === 1 && files.length > 1) {
  let failed = false;
  for (const file of files) {
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', file], { stdio: 'inherit', env });
    if (result.error || result.signal || result.status !== 0) failed = true;
  }
  if (failed) process.exitCode = 1;
} else {
  const results = run({ files, concurrency });
  let reported = 0;
  results.on('test:pass', () => { reported++; });
  results.on('test:fail', () => { reported++; process.exitCode = 1; });
  results.on('end', () => { if (!reported) process.exitCode = 1; });
  results.on('error', error => { console.error(error); process.exitCode = 1; });
  results.compose(tap).pipe(process.stdout);
}
