// C1-remainder — a transient reviewer failure must not sink a manual review. Reviewers occasionally drop
// the connection or return a truncated response (both happened while building this branch), so runReview
// returns status 'error' with no verdict. The pipeline retries the review stage once; the manual `chalk
// review` did not — it died on the first flake. Now it retries once (bounded) and only a SECOND consecutive
// error is fatal. The pipeline passes --no-retry (it owns stage-level retry), so that flag must suppress the
// inner retry. Driven by stub reviewers that count their invocations. Locked.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const conf = (d, fn) => {
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o.protocol);
  writeFileSync(f, JSON.stringify(o, null, 2));
};
const tid = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id.slice(0, 12);
const calls = (d) => +readFileSync(join(d, 'n.txt'), 'utf8'); // how many times the stub reviewer ran

// A stub reviewer that counts invocations in n.txt (it runs in the project root), then emits `bodyExpr` —
// a JS expression over `n` (0-based call index) producing the stdout string.
const COUNTER = `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\n`
  + `const c = 'n.txt'; const n = existsSync(c) ? +readFileSync(c, 'utf8') : 0; writeFileSync(c, String(n + 1));\n`
  + `process.stdin.on('data', () => {}); process.stdin.on('end', () => process.stdout.write`;
const GARBAGE = `'API Error: connection closed mid-response'`;
const PASS = `JSON.stringify({ verdict: 'pass', findings: [] })`;
const FLAKY = `${COUNTER}(n === 0 ? ${GARBAGE} : ${PASS}));`;      // 1st call fails, then passes
const ALWAYS_ERR = `${COUNTER}(${GARBAGE}));`;                     // every call fails

function project(reviewerBody) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-retry-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'reviewer.mjs'), reviewerBody);
  conf(d, (p) => { p.review = { command: 'node reviewer.mjs', requiredAt: ['per-task'] }; });
  writeFileSync(join(d, 'x.test.mjs'), `import a from 'node:assert'; a.equal(1, 1);`);
  chalk(d, 'task', 'add', 'feat: thing');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'does the thing', '--test', 'x.test.mjs');
  chalk(d, 'start', id);
  return { d, id };
}

test('review — a transient failure is retried once, then the valid verdict is accepted', () => {
  const { d, id } = project(FLAKY);
  const r = chalk(d, 'review', id);
  assert.equal(r.code, 0, 'the retry gets a valid pass verdict → review passes instead of dying on the first flake');
  const t = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
  assert.equal((t.reviews.slice(-1)[0] || {}).verdict, 'pass', 'a pass review is recorded after the retry');
  assert.equal(calls(d), 2, 'exactly two reviewer invocations — the initial call plus one retry');
});

test('review — two consecutive errors are fatal, and the retry is BOUNDED (not infinite/swallowed)', () => {
  const { d, id } = project(ALWAYS_ERR);
  const r = chalk(d, 'review', id);
  assert.notEqual(r.code, 0, 'a persistent reviewer failure still fails the review — it is not swallowed');
  assert.equal(calls(d), 2, 'retried exactly once (2 calls total), then dies — bounded, not indefinite');
});

test('review --no-retry — suppresses the retry (the pipeline owns stage-level retry, must not double-count)', () => {
  const { d, id } = project(ALWAYS_ERR);
  const r = chalk(d, 'review', id, '--no-retry');
  assert.notEqual(r.code, 0, 'still fails on error');
  assert.equal(calls(d), 1, 'exactly one reviewer call — --no-retry suppresses the inner retry');
});
