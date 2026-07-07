// Narrowed .chalk/ tracking-gate exemption (#126; dupes #122/#118). The #107 tracking gate blanket-
// exempted every pinned path under `.chalk/`, justified by spine state landing out-of-band — but
// `chalk` also locks e2e specs at `.chalk/tests/<slug>.test.yaml`, real contract tests that CI runs.
// The blanket exemption gave them NO tracking gate, re-opening the exact vacuous-green hole #107
// closed (an untracked spec ships, CI runs without it). Now the exemption is narrowed: `.chalk/tests/`
// specs are tracking-gated like any other test, genuine out-of-band spine STATE stays exempt, and
// `chalk commit` stages `.chalk/tests/` so the pipeline tracks them. This suite pins the carve-out in
// BOTH directions. Locked contract for the task tracking issue #126.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spineStateExempt } from '../lib/testgate.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('spineStateExempt — .chalk/tests/ specs are NOT exempt; other .chalk/ spine state is', () => {
  assert.equal(spineStateExempt('.chalk/tests/login.test.yaml'), false, 'e2e specs are gated (real contract tests)');
  assert.equal(spineStateExempt('.chalk/tasks.json'), true, 'spine state is exempt');
  assert.equal(spineStateExempt('.chalk/boards/x.json'), true, 'boards are exempt');
  assert.equal(spineStateExempt('test/foo.test.mjs'), false, 'ordinary code tests are gated');
});

// A git spine with one in-progress task pinning both an out-of-band spine-state file AND an e2e
// spec under .chalk/tests/, each present on disk with a matching sha256 pin. Verify is unconfigured
// (vacuous green) and review is off, so the tracking gate is the only thing standing before `done`.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-ttrack-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  const spec = join(d, '.chalk/tests/flow.test.yaml');
  writeFileSync(spec, 'apiVersion: chalk/v1\nkind: Test\nid: spec-x\nname: X\nsteps: []\n');
  const state = join(d, '.chalk/mystate.json'); // a non-tests .chalk/ path standing in for out-of-band spine state
  writeFileSync(state, '{"k":1}\n');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', startedAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [],
    tests: [
      { path: '.chalk/tests/flow.test.yaml', sha256: sha(spec) },
      { path: '.chalk/mystate.json', sha256: sha(state) },
    ],
  }]));
  return d;
}

test('direction 2 — an untracked .chalk/tests/ spec BLOCKS chalk done; tracking it opens the gate', () => {
  const d = repo();
  // The out-of-band state file is left untracked too — it must NOT be the reason for any block.
  const blocked = chalk(d, 'done', 'task-aaaaaaaa');
  assert.notEqual(blocked.code, 0, `an untracked e2e spec must block done: ${blocked.out}`);
  assert.match(blocked.out, /flow\.test\.yaml/, 'the e2e spec is named as the offender');
  assert.doesNotMatch(blocked.out, /mystate\.json/, 'the exempt spine-state file is NOT flagged');
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'in-progress', 'not marked done');
  // Track the spec → the gate opens (the exempt state file is still untracked and still ignored).
  execSync('git add .chalk/tests/flow.test.yaml', { cwd: d });
  const done = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(done.code, 0, `a tracked e2e spec passes the gate even with the state file untracked: ${done.out}`);
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'done');
});

test('direction 1 — a lone untracked non-tests .chalk/ spine-state pin is exempt (done succeeds)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-ttrack-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  const state = join(d, '.chalk/mystate.json');
  writeFileSync(state, '{"k":1}\n');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', startedAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: '.chalk/mystate.json', sha256: sha(state) }],
  }]));
  const r = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `an out-of-band spine-state pin must not block done: ${r.out}`);
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state, 'done');
});

test('chalk commit stages a pinned .chalk/tests/ spec so the pipeline tracks it', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-ttrack-'));
  execSync('git init -q -b main', { cwd: d });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  execSync('git add -A && git commit -q -m init', { cwd: d });
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  writeFileSync(join(d, '.chalk/tests/flow.test.yaml'), 'apiVersion: chalk/v1\nkind: Test\nid: spec-x\nname: X\nsteps: []\n');
  writeFileSync(join(d, 'feature.js'), 'export const f = 1;\n'); // a code change so commit has something
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', branch: 'feat/x', branchType: 'feat',
    acceptanceCriteria: [{ text: 'x' }], reviews: [], tests: [{ path: '.chalk/tests/flow.test.yaml', sha256: sha(join(d, '.chalk/tests/flow.test.yaml')) }],
    pipeline: { stage: 'branched', at: '2026-01-01T00:00:00Z' },
  }]));
  assert.equal(chalk(d, 'commit', 'task-aaaaaaaa').code, 0);
  const tracked = execSync('git ls-files .chalk/tests/', { cwd: d, encoding: 'utf8' });
  assert.match(tracked, /flow\.test\.yaml/, 'the e2e spec was staged+committed by chalk commit');
  // But spine STATE (tasks.json) stays OUT of the feature-branch commit.
  assert.doesNotMatch(execSync('git show --stat --name-only HEAD', { cwd: d, encoding: 'utf8' }), /tasks\.json/, 'spine state is not swept into the branch commit');
});
