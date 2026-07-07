// Tracking-gate path normalization (#129). untrackedLockedTests compared pinned paths verbatim
// against `git ls-files`, so an equivalent form — a leading `./`, Windows backslashes, or a
// case-only difference on a case-insensitive filesystem — was reported untracked even though git
// tracks it, false-blocking `chalk done`/`chalk pr` on a shippable task. The gate must fire ONLY on
// a genuinely untracked file. Now both sides are normalized (separators unified, leading `./` and
// trailing slash stripped; lowercased when git core.ignorecase is on). This suite pins the
// normalization across all variants (portable, via the exported helper) AND the end-to-end guarantee:
// a `./`-pinned tracked file lets `chalk done` proceed, while a genuinely untracked pin still blocks
// (no #107 regression). Locked contract for the task tracking issue #129.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normTrackPath } from '../lib/testgate.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const stateOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].state;

test('normTrackPath — equivalent forms collapse; case handled per the ignoreCase flag', () => {
  // Leading ./ and trailing slash stripped; backslashes unified — case-sensitive (default).
  assert.equal(normTrackPath('./contract.test.mjs'), 'contract.test.mjs');
  assert.equal(normTrackPath('././a/b.mjs'), 'a/b.mjs');
  assert.equal(normTrackPath('sub\\dir\\x.test.mjs'), 'sub/dir/x.test.mjs');
  assert.equal(normTrackPath('dir/'), 'dir');
  // A raw ls-files entry (already clean) is unchanged, so the two sides meet.
  assert.equal(normTrackPath('a/b.mjs'), normTrackPath('./a\\b.mjs'));
  // Case is significant on a case-sensitive FS, folded when ignoreCase is on.
  assert.notEqual(normTrackPath('Contract.MJS'), normTrackPath('contract.mjs'));
  assert.equal(normTrackPath('Contract.MJS', true), normTrackPath('./contract.mjs', true));
});

// A git spine with one in-progress task whose locked test exists + matches its pin. Verify is
// unconfigured (vacuous green) and review off, so the tracking gate alone gates `chalk done`.
function repo(pinAs) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-tpath-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, 'contract.test.mjs'), "import { test } from 'node:test'; test('c', () => {});\n");
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a', state: 'in-progress', startedAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [],
    tests: [{ path: pinAs, sha256: sha(join(d, 'contract.test.mjs')) }],
  }]));
  return d;
}

test('a tracked file pinned as `./<path>` is NOT reported untracked — chalk done proceeds', () => {
  const d = repo('./contract.test.mjs'); // git ls-files reports it as "contract.test.mjs"
  execSync('git add contract.test.mjs', { cwd: d });
  const r = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `a ./-pinned tracked file must not false-block: ${r.out}`);
  assert.equal(stateOf(d), 'done');
});

test('a genuinely untracked pin STILL blocks (no #107 regression)', () => {
  const d = repo('contract.test.mjs'); // exists on disk but never `git add`ed
  const r = chalk(d, 'done', 'task-aaaaaaaa');
  assert.notEqual(r.code, 0, `an untracked pinned test must still block: ${r.out}`);
  assert.match(r.out, /not tracked|untracked/i);
  assert.match(r.out, /contract\.test\.mjs/);
  assert.equal(stateOf(d), 'in-progress');
  // Tracking it opens the gate — even though the pin carried a `./` prefix.
  execSync('git add contract.test.mjs', { cwd: d });
  assert.equal(chalk(d, 'done', 'task-aaaaaaaa').code, 0, 'proceeds once tracked');
});

test('case-insensitive filesystem — a case-only pin difference does not false-block', (t) => {
  // Only meaningful where a differently-cased path resolves to the same file (macOS/Windows default).
  const d = repo('contract.test.mjs');
  execSync('git add contract.test.mjs', { cwd: d });
  execSync('git config core.ignorecase true', { cwd: d });
  // Does the FS resolve a different-case path to the same file? If not (case-sensitive FS), skip —
  // the pin's file wouldn't exist for the sha check anyway, which is the documented platform boundary.
  let caseInsensitiveFS = false;
  try { caseInsensitiveFS = readFileSync(join(d, 'CONTRACT.TEST.MJS'), 'utf8').length > 0; } catch { /* case-sensitive */ }
  if (!caseInsensitiveFS) return t.skip('case-sensitive filesystem — case-fold path not applicable');
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  tasks[0].tests[0].path = 'Contract.Test.MJS'; // pinned with different case than ls-files
  tasks[0].tests[0].sha256 = sha(join(d, 'CONTRACT.TEST.MJS'));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(tasks));
  const r = chalk(d, 'done', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `case-only difference must not false-block on an ignorecase FS: ${r.out}`);
  assert.equal(stateOf(d), 'done');
});
