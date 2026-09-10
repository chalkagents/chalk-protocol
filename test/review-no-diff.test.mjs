// A diffless review must not silently pass (#151). With a pinned task base,
// an empty candidate must not run the reviewer — which then produced a PASS/BLOCK over
// an EMPTY change set (a vacuous certification, same class as #134). Now, inside a git work tree, an
// empty diff makes runReview return 'no-diff' WITHOUT invoking the reviewer, and `chalk review` aborts
// loudly (non-zero, no review recorded). A real diff is unaffected. Locked contract for #151.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tid = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id.slice(0, 12);
const reviewsOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].reviews || [];
// A reviewer that records it was invoked (n.txt) and always passes — so a PASS proves it actually ran.
const REVIEWER = `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\n`
  + `const c = 'n.txt'; writeFileSync(c, String(existsSync(c) ? +readFileSync(c, 'utf8') + 1 : 1));\n`
  + `process.stdin.on('data', () => {}); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ verdict: 'pass', findings: [] })));\n`;

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-nodiff-'));
  const counter = `${d}.calls`; // instrumentation stays outside the read-only reviewer workspace
  execSync('git init -q -b main && git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'reviewer.mjs'), REVIEWER.replace("const c = 'n.txt'", `const c = ${JSON.stringify(counter)}`));
  conf(d, (p) => { p.review = { command: 'node reviewer.mjs', requiredAt: ['per-task'] }; });
  writeFileSync(join(d, 'x.test.mjs'), "import a from 'node:assert'; a.equal(1, 1);\n");
  chalk(d, 'task', 'add', 'feat: thing');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'c', '--test', 'x.test.mjs');
  execSync('git add reviewer.mjs x.test.mjs AGENTS.md CLAUDE.md .chalk/spec.md && git commit -q -m baseline', { cwd: d });
  chalk(d, 'start', id);
  return { d, id, counter };
}

test('an empty diff in a git tree aborts review loudly and never invokes the reviewer', () => {
  const { d, id, counter } = repo(); // baseline pinned at start; only excluded Chalk bookkeeping differs
  const r = chalk(d, 'review', id);
  assert.notEqual(r.code, 0, 'a diffless review must fail, not pass');
  assert.match(r.out, /no diff|empty/i, 'the abort names the empty change set');
  assert.equal(existsSync(counter), false, 'the reviewer was NOT invoked (no vacuous verdict spent)');
  assert.equal(reviewsOf(d).length, 0, 'no review verdict is recorded on the task');
});

test('a change committed after the pinned task start is captured on the same branch', () => {
  const { d, id, counter } = repo();
  // The task start pins the baseline, so subsequent commits remain reviewable on this branch.
  writeFileSync(join(d, 'code.js'), 'export const v = 1;\n');
  execSync('git add code.js && git commit -q -m "feat: work"', { cwd: d });
  const r = chalk(d, 'review', id);
  assert.equal(r.code, 0, `a committed change must be reviewable even with no base delta: ${r.out}`);
  assert.equal(existsSync(counter), true, 'the reviewer WAS invoked (the committed change was captured)');
  assert.equal((reviewsOf(d).slice(-1)[0] || {}).verdict, 'pass');
});

test('a real diff reviews normally — the reviewer runs and its verdict is recorded', () => {
  const { d, id, counter } = repo();
  // Give the tree a genuine, tracked change so a git-diff strategy captures it.
  writeFileSync(join(d, 'code.js'), 'export const v = 1;\n');
  execSync('git add code.js && git commit -q -m base', { cwd: d });
  writeFileSync(join(d, 'code.js'), 'export const v = 2; // changed\n'); // unstaged mod → git diff HEAD shows it
  const r = chalk(d, 'review', id);
  assert.equal(r.code, 0, `a review with a real diff proceeds: ${r.out}`);
  assert.equal(existsSync(counter), true, 'the reviewer WAS invoked when a diff exists');
  assert.equal((reviewsOf(d).slice(-1)[0] || {}).verdict, 'pass', 'the verdict is recorded');
});
