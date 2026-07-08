// A diffless review must not silently pass (#151). captureDiff tries several git-diff strategies and,
// when all come up empty, chalk used to still run the reviewer — which then produced a PASS/BLOCK over
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
  execSync('git init -q && git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'reviewer.mjs'), REVIEWER);
  conf(d, (p) => { p.review = { command: 'node reviewer.mjs', requiredAt: ['per-task'] }; });
  writeFileSync(join(d, 'x.test.mjs'), "import a from 'node:assert'; a.equal(1, 1);\n");
  chalk(d, 'task', 'add', 'feat: thing');
  const id = tid(d);
  chalk(d, 'spec', id, '--criterion', 'c', '--test', 'x.test.mjs');
  chalk(d, 'start', id);
  return { d, id };
}

test('an empty diff in a git tree aborts review loudly and never invokes the reviewer', () => {
  const { d, id } = repo(); // nothing committed/tracked → every git-diff strategy is empty
  const r = chalk(d, 'review', id);
  assert.notEqual(r.code, 0, 'a diffless review must fail, not pass');
  assert.match(r.out, /no diff|empty/i, 'the abort names the empty change set');
  assert.equal(existsSync(join(d, 'n.txt')), false, 'the reviewer was NOT invoked (no vacuous verdict spent)');
  assert.equal(reviewsOf(d).length, 0, 'no review verdict is recorded on the task');
});

test('a change COMMITTED on the current branch (no base delta, clean tree) is still captured + reviewed', () => {
  const { d, id } = repo();
  // Commit real work to the branch, leaving a CLEAN tree — every base-relative diff is empty (HEAD is
  // the base), so only the committed-change fallback can capture it. Without that fallback this would
  // wrongly abort as no-diff. This is the `chalk demo` / single-branch topology.
  writeFileSync(join(d, 'code.js'), 'export const v = 1;\n');
  execSync('git add code.js && git commit -q -m "feat: work"', { cwd: d });
  const r = chalk(d, 'review', id);
  assert.equal(r.code, 0, `a committed change must be reviewable even with no base delta: ${r.out}`);
  assert.equal(existsSync(join(d, 'n.txt')), true, 'the reviewer WAS invoked (the committed change was captured)');
  assert.equal((reviewsOf(d).slice(-1)[0] || {}).verdict, 'pass');
});

test('a real diff reviews normally — the reviewer runs and its verdict is recorded', () => {
  const { d, id } = repo();
  // Give the tree a genuine, tracked change so a git-diff strategy captures it.
  writeFileSync(join(d, 'code.js'), 'export const v = 1;\n');
  execSync('git add code.js && git commit -q -m base', { cwd: d });
  writeFileSync(join(d, 'code.js'), 'export const v = 2; // changed\n'); // unstaged mod → git diff HEAD shows it
  const r = chalk(d, 'review', id);
  assert.equal(r.code, 0, `a review with a real diff proceeds: ${r.out}`);
  assert.equal(existsSync(join(d, 'n.txt')), true, 'the reviewer WAS invoked when a diff exists');
  assert.equal((reviewsOf(d).slice(-1)[0] || {}).verdict, 'pass', 'the verdict is recorded');
});
