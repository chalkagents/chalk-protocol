// Reviewer diff excludes spine state (#114). Issue intake writes tasks.json entries + board rows for
// the whole imported batch; per-task start/spec/pin churn the same files. None of it is the change
// under review, but it floated into every reviewed diff (uncommitted in manual mode, or committed
// on-branch), and FOUR reviews in one sweep flagged the same "unrelated queue metadata" design-intent
// finding — burning the adversary's attention against chalk's own "keep diffs small and scoped" rule.
// Now captureDiff excludes spine STATE via git pathspecs while keeping contract artifacts (.chalk/tests/
// e2e specs, .chalk/evidence/). This suite proves the reviewer's prompt carries the CODE change and a
// pinned .chalk/tests/ spec but NOT tasks.json / board / other imported tasks. Locked contract for #114.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEW_DIFF_EXCLUDES } from '../lib/review.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('REVIEW_DIFF_EXCLUDES — spine state is excluded, contract artifacts are not', () => {
  const joined = REVIEW_DIFF_EXCLUDES.join(' ');
  for (const p of ['.chalk/tasks.json', '.chalk/boards', '.chalk/updates.jsonl', '.chalk/plans', '.chalk/decisions.md'])
    assert.match(joined, new RegExp(`exclude\\)${p.replace(/[.]/g, '\\.')}'`), `${p} is excluded from the reviewer diff`);
  assert.doesNotMatch(joined, /\.chalk\/tests/, '.chalk/tests/ specs stay visible (contract)');
  assert.doesNotMatch(joined, /\.chalk\/evidence/, '.chalk/evidence/ stays visible');
});

test('chalk review — the reviewer prompt carries the code + the .chalk/tests spec, NOT spine churn', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-diffscope-'));
  execSync('git init -q -b main', { cwd: d });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  execSync('git add -A && git commit -q -m init', { cwd: d });

  // A stub reviewer that records the prompt it received (stdin) to a file, then passes.
  const promptFile = join(d, 'seen-prompt.txt');
  writeFileSync(join(d, 'rev.mjs'), `import {readFileSync,writeFileSync} from 'node:fs';
    let s=''; try{s=readFileSync(0,'utf8')}catch{} writeFileSync(${JSON.stringify(promptFile)}, s);
    console.log(JSON.stringify({verdict:'pass',findings:[]}));`);
  conf(d, (o) => { o.review = { command: `node ${join(d, 'rev.mjs')}`, requiredAt: ['per-task'] }; });

  // The change under review: a real code file + a locked e2e spec under .chalk/tests/.
  writeFileSync(join(d, 'feature.js'), 'export const REAL_CODE_UNDER_REVIEW = 1;\n');
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  const spec = join(d, '.chalk/tests/flow.test.yaml');
  writeFileSync(spec, 'apiVersion: chalk/v1\nkind: Test\nid: SPEC_CONTRACT_ARTIFACT\nname: X\nsteps: []\n');

  // Spine CHURN that must NOT reach the reviewer: an in-progress task PLUS an unrelated imported task
  // and a board row, exactly as issue intake would leave in the working tree.
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: 'feat: under review', state: 'in-progress', acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: '.chalk/tests/flow.test.yaml', sha256: sha(spec) }] },
    { id: 'task-bbbbbbbb', title: 'UNRELATED_IMPORTED_TASK', state: 'specd', acceptanceCriteria: [{ text: 'other' }], reviews: [] },
  ], null, 2));
  mkdirSync(join(d, '.chalk/boards'), { recursive: true });
  writeFileSync(join(d, '.chalk/boards/p.board.json'), JSON.stringify({ cards: [{ title: 'UNRELATED_IMPORTED_TASK' }] }, null, 2));
  // Track the spec so the tracking gate is satisfied when review runs.
  execSync('git add feature.js .chalk/tests/flow.test.yaml', { cwd: d });

  const r = chalk(d, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `review runs: ${r.out}`);
  assert.ok(existsSync(promptFile), 'the reviewer received a prompt');
  const seen = readFileSync(promptFile, 'utf8');
  // The reviewer SEES the code and the contract spec.
  assert.match(seen, /REAL_CODE_UNDER_REVIEW/, 'the code change is in the reviewed diff');
  assert.match(seen, /SPEC_CONTRACT_ARTIFACT/, 'the .chalk/tests/ spec is in the reviewed diff (contract artifact)');
  // The reviewer does NOT see spine churn.
  assert.doesNotMatch(seen, /UNRELATED_IMPORTED_TASK/, 'other imported tasks / board rows are excluded');
  assert.doesNotMatch(seen, /tasks\.json/, 'tasks.json is not in the reviewed diff');
});
