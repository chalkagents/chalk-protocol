// Explicit files preserve the caller's schedule; Node's CLI alphabetizes them.
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
const concurrency = Number(process.argv[2]), files = process.argv.slice(3);
if (!Number.isInteger(concurrency) || concurrency < 1 || !files.length) throw new Error('verification batch requires concurrency and test files');
const results = run({ files, concurrency });
let reported = 0;
results.on('test:pass', () => { reported++; });
results.on('test:fail', () => { reported++; process.exitCode = 1; });
results.on('end', () => { if (!reported) process.exitCode = 1; });
results.on('error', error => { console.error(error); process.exitCode = 1; });
results.compose(tap).pipe(process.stdout);
