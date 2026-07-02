// Gate hardening — a broken PROBE must never read as a PASSED gate, and the reviewer must know
// what it cannot see.
//   - break-it: a breakTest template whose command can't run (ENOENT / exit 127 / timeout) used to
//     read as "the test fails on base" — i.e. rigorous — while checking nothing. Now → `inconclusive`.
//   - mutation: an unrunnable mutation tool used to silently read as "all mutants killed". Now →
//     `inconclusive` (still non-blocking, but loud).
//   - CLI (M2 wiring): `chalk work` blocks on real survivors and prints INCONCLUSIVE for unrunnable
//     probes instead of passing silently.
//   - review (P5): the prompt diff is capped; the cap must be MARKED and the changed-file list
//     (--stat) appended, so the adversarial reviewer knows the diff is partial and what to read.
//   - handoff: a failing narrator agent warns instead of silently writing an empty Notes section.
// Locked contract for task-389663a.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { runBreakit } from '../lib/breakit.mjs';
import { runMutation } from '../lib/mutation.mjs';
import { formatDiffForReview } from '../lib/review.mjs';
import { writeHandoff } from '../lib/handoff.mjs';
import { Store } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'gatehard-'));
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
const confIn = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const stubGh = (dir, body) => { const p = join(dir, 'fake-gh.mjs'); writeFileSync(p, body); return `node ${p}`; };
// A working repo whose origin is a local bare repo, so `git push` really works (offline).
function repoWithBare() {
  const bare = scratch();
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' });
  const d = scratch();
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'README.md'), '# tmp\n'); g('add README.md'); g('commit -m init');
  g(`remote add origin ${bare}`); g('push -u origin main');
  return d;
}

// Throwaway git repo with a base commit and a working-tree implementation change.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'gatehard-'));
  const g = (a) => execSync(`git ${a}`, { cwd: d, stdio: 'pipe' });
  g('init -b main'); g('config user.email t@t.t'); g('config user.name t');
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 0;\n');
  g('add -A'); g('commit -m base');
  writeFileSync(join(d, 'feature.mjs'), 'export const f = () => 1;\n');
  mkdirSync(join(d, 'test'), { recursive: true });
  return d;
}

test('break-it — an unrunnable probe command is INCONCLUSIVE, never "fails on base"', () => {
  const d = repo();
  writeFileSync(join(d, 'test/feat.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert'; import { f } from '../feature.mjs';\n` +
    `test('returns 1', () => assert.equal(f(), 1));\n`);
  const store = { protocol: () => ({ breakTest: 'chalk-no-such-tool-xyz {test}' }) };
  const r = runBreakit(store, { tests: [{ path: 'test/feat.test.mjs' }] }, { cwd: d });
  assert.equal(r.skipped, false, 'the gate ran');
  assert.deepEqual(r.vacuous, [], 'an unrunnable probe must not flag vacuous');
  assert.deepEqual(r.inconclusive, ['test/feat.test.mjs'], 'the unrunnable probe is reported, not hidden');
  assert.match(readFileSync(join(d, 'feature.mjs'), 'utf8'), /=> 1/, 'impl restored');
});

test('break-it — a real probe still separates vacuous from asserting, with nothing inconclusive', () => {
  const d = repo();
  writeFileSync(join(d, 'test/vac.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert';\n` +
    `test('trivially true', () => assert.equal(1, 1));\n`);
  const store = { protocol: () => ({ breakTest: 'node --test {test}' }) };
  const r = runBreakit(store, { tests: [{ path: 'test/vac.test.mjs' }] }, { cwd: d });
  assert.deepEqual(r.vacuous, ['test/vac.test.mjs']);
  assert.deepEqual(r.inconclusive, []);
});

test('mutation — an unrunnable tool is INCONCLUSIVE, not silently "all mutants killed"', () => {
  const d = repo();
  const store = { protocol: () => ({ mutation: 'chalk-no-such-tool-xyz {file}' }) };
  const r = runMutation(store, {}, { cwd: d });
  assert.equal(r.skipped, false);
  assert.deepEqual(r.survived, [], 'an unrunnable tool must not false-block');
  assert.deepEqual(r.inconclusive, ['feature.mjs'], 'the unrunnable tool is reported');
});

test('mutation — a tool that runs and reports survivors still flags them', () => {
  const d = repo();
  const store = { protocol: () => ({ mutation: 'node -e "process.exit(1)" {file}' }) };
  const r = runMutation(store, {}, { cwd: d });
  assert.deepEqual(r.survived, ['feature.mjs']);
  assert.deepEqual(r.inconclusive, []);
});

test('review prompt — a truncated diff is marked and the --stat file list is appended', () => {
  const big = formatDiffForReview('x'.repeat(25000), ' feature.mjs | 2 +-\n 1 file changed');
  assert.match(big, /diff truncated/i, 'the reviewer is told the diff is partial');
  assert.match(big, /Changed files \(git diff --stat\)/);
  assert.match(big, /feature\.mjs \| 2/);
  assert.ok(big.indexOf('x'.repeat(100)) === 0, 'the head of the diff is preserved');

  const small = formatDiffForReview('tiny diff', ' feature.mjs | 2 +-');
  assert.doesNotMatch(small, /diff truncated/i, 'no false truncation marker on small diffs');
  assert.match(small, /Changed files \(git diff --stat\)/, 'stat list appended even when not truncated');
});

test('chalk work — M2 wiring: real survivors block (exit 2); unrunnable probes warn INCONCLUSIVE and do not block', () => {
  const d = repo();
  chalk(d, 'init', '--name', 't', '--goal', 'g');
  const conf = (fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
  conf((p) => {
    p.verify = { test: 'node --test test' };
    p.mutation = 'node -e "process.exit(1)" {file}'; // every mutant "survives"
    p.plan = { required: false };
    p.worktree = { enabled: false };
  });
  // A locked test (never edited after locking) + a separate new test that satisfies lever 1.
  writeFileSync(join(d, 'test/locked.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert'; import { f } from '../feature.mjs';\n` +
    `test('returns 1', () => assert.equal(f(), 1));\n`);
  chalk(d, 'task', 'add', 'feat: harden');
  const id = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')).at(-1).id;
  chalk(d, 'spec', id, '--criterion', 'f returns 1', '--test', 'test/locked.test.mjs');
  chalk(d, 'start', id);
  writeFileSync(join(d, 'test/extra.test.mjs'),
    `import { test } from 'node:test'; import assert from 'node:assert';\n` +
    `test('extra', () => assert.equal(2, 2));\n`);

  const blocked = chalk(d, 'work', id);
  assert.equal(blocked.code, 2, 'surviving mutants close the work gate');
  assert.match(blocked.out, /mutants survived/);

  conf((p) => { p.mutation = 'chalk-no-such-tool-xyz {file}'; });
  const warned = chalk(d, 'work', id);
  assert.equal(warned.code, 0, 'an unrunnable probe must not block real work');
  assert.match(warned.out, /INCONCLUSIVE/, 'but it must be loud, not silent');
});

test('review prompt — a truncated diff with NO stat available makes no false promise of a file list', () => {
  const t = formatDiffForReview('x'.repeat(25000), '');
  assert.match(t, /diff truncated/i, 'still marked as partial');
  assert.match(t, /read the remaining files in the working tree/);
  assert.doesNotMatch(t, /file list is below/, 'must not promise a list that is not there');
  assert.doesNotMatch(t, /Changed files \(git diff --stat\)/);
});

test('cost ledger — an unwritable ledger warns once per PROCESS (across store instances), never throws', () => {
  const d = repo();
  chalk(d, 'init', '--name', 't', '--goal', 'g');
  rmSync(join(d, '.chalk/local'), { recursive: true, force: true });
  writeFileSync(join(d, '.chalk/local'), 'not a directory\n'); // sabotage: the ledger dir is a file
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    const s1 = new Store(d);
    s1.logCost({ taskId: 't', stage: 'work', agent: 'executor', ms: 1 });
    s1.logCost({ taskId: 't', stage: 'review', agent: 'reviewer', ms: 1 });
    new Store(d).logCost({ taskId: 't', stage: 'plan', agent: 'planner', ms: 1 }); // fresh instance, same process
  } finally { console.error = orig; }
  const warns = errs.filter((l) => /cost ledger write failed/.test(l));
  assert.equal(warns.length, 1, `exactly one warning per process, got ${warns.length}: ${errs.join(' | ')}`);
});

test('chalk merge — labels the safety source when broke-check fell back to LOCAL verify', () => {
  const d = repoWithBare();
  chalk(d, 'init', '--name', 'p');
  const merged = join(d, 'merged.txt');
  const ghCmd = stubGh(d, `import {writeFileSync} from 'node:fs'; const a=process.argv.slice(2); const has=(...x)=>x.every(y=>a.includes(y));
    if(has('pr','create')) console.log('https://github.com/o/r/pull/9');
    else if(has('pr','checks')) console.log('[]');
    else if(has('pr','merge')) writeFileSync(${JSON.stringify(merged)}, a.join(' '));
    else console.log(JSON.stringify([{number:9,title:'Add thing',url:'u',body:'- [ ] do it',labels:[{name:'enhancement'}]}]));`);
  writeFileSync(join(d, 'exec.mjs'), `import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{} writeFileSync('feature.js','export const f=1;\\n'); writeFileSync('feature.test.js','// asserts\\n');`);
  const wtbase = scratch();
  confIn(d, (o) => { o.github.command = ghCmd; o.worktree.dir = wtbase; o.executor = { command: `node ${join(d, 'exec.mjs')}` }; });
  chalk(d, 'issue', 'pull');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'branch', id); chalk(d, 'work', id); chalk(d, 'commit', id); chalk(d, 'pr', id);
  const m = chalk(d, 'merge', id);
  assert.equal(m.code, 0, `merge proceeds on green local verify: ${m.out}`);
  assert.match(m.out, /LOCAL verify/, 'the local fallback is labeled, not silent');
  assert.ok(existsSync(merged), 'merge actually ran');
});

test('handoff — a failing narrator agent warns and still writes the template doc', () => {
  const d = repo();
  const store = {
    root: d,
    protocol: () => ({ handoff: { command: 'chalk-no-such-tool-xyz' } }),
    upsertTask() {}, emitUpdate() {},
  };
  const task = { id: 'task-narrfail000', title: 'narrator down', state: 'in-progress', acceptanceCriteria: [], tests: [] };
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  let rec;
  try { rec = writeHandoff(store, task, { reason: 'test' }); } finally { console.error = orig; }
  assert.ok(existsSync(join(d, rec.path)), 'handoff doc written despite the narrator failure');
  assert.ok(errs.some((l) => /handoff narrator failed/.test(l)), 'the failure is warned, not swallowed');
});
