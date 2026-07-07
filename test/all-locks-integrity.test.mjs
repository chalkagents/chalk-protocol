// Opt-in all-locks integrity (#80). By default `verify` hashes locked tests only for in-progress
// tasks, so a task's lock protection expires at `done` — a later task can weaken an earlier done
// task's locked test to keep its own verify green (the ImpossibleBench one-task-removed cheat).
// Under `protocol.integrity: "all-locks"`, verify also hashes every DONE task's locked tests.
// `chalk amend-spec` stays the only sanctioned change path. This suite pins all four states:
// all-locks catches a tampered done-task lock (RED), the default mode ignores the same tamper
// (GREEN), a clean all-locks tree is GREEN, and amend-spec restores GREEN after a legitimate
// change. Locked contract for the task tracking issue #80.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const CONTRACT = "import { test } from 'node:test'; test('contract', () => {});\n";

// A spine with one DONE task whose locked test is pinned & matches on disk. `integrity` mode is a
// parameter. No in-progress task — verify still hashes done locks under all-locks.
function repoWithDoneLock(integrity) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-alllocks-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'contract.test.mjs'), CONTRACT);
  conf(d, (o) => { o.integrity = integrity; });
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-done1111', title: 'feat: earlier contract', state: 'done', doneAt: '2026-01-01T00:00:00Z',
    acceptanceCriteria: [{ text: 'x' }], reviews: [],
    tests: [{ path: 'contract.test.mjs', sha256: sha(join(d, 'contract.test.mjs')) }],
  }]));
  return d;
}
const tamper = (d) => writeFileSync(join(d, 'contract.test.mjs'), "import { test } from 'node:test'; test('contract', () => { /* gutted */ });\n");

test('all-locks — a clean tree is GREEN; the done task lock is verified but intact', () => {
  const d = repoWithDoneLock('all-locks');
  const r = chalk(d, 'verify');
  assert.equal(r.code, 0, `an intact done lock must stay GREEN: ${r.out}`);
  assert.match(r.out, /GREEN/);
});

test('all-locks — tampering a DONE task lock turns verify RED and names the task + amend-spec fix', () => {
  const d = repoWithDoneLock('all-locks');
  tamper(d);
  const r = chalk(d, 'verify');
  assert.equal(r.code, 2, `a tampered done lock must fail verify under all-locks: ${r.out}`);
  assert.match(r.out, /RED/);
  assert.match(r.out, /integrity/i, 'reports an integrity violation');
  assert.match(r.out, /contract\.test\.mjs/, 'names the offending path');
  assert.match(r.out, /task-done111/, 'names the owning done task (12-char display id)');
  assert.match(r.out, /amend-spec/, 'points to the sanctioned change path');
});

test('default mode — the SAME tamper on a done lock is ignored (protection expires at done)', () => {
  const d = repoWithDoneLock('in-progress');
  tamper(d);
  const r = chalk(d, 'verify');
  assert.equal(r.code, 0, `default integrity must NOT hash done-task locks: ${r.out}`);
  assert.match(r.out, /GREEN/);
  // And unset behaves exactly like 'in-progress' (today's behavior) — no integrity section.
  const d2 = repoWithDoneLock('in-progress');
  conf(d2, (o) => { delete o.integrity; });
  tamper(d2);
  assert.equal(chalk(d2, 'verify').code, 0, 'unset integrity leaves done locks unchecked');
});

test('amend-spec — the sanctioned path: re-locking the done task restores GREEN under all-locks', () => {
  const d = repoWithDoneLock('all-locks');
  tamper(d);
  assert.equal(chalk(d, 'verify').code, 2, 'tampered lock is RED before the amend');
  // amend-spec re-locks the done task's test to its new content (the legitimate change path).
  const a = chalk(d, 'amend-spec', 'task-done1111', '--test', 'contract.test.mjs', '--why', 'contract intentionally evolved');
  assert.equal(a.code, 0, `amend-spec must accept a done task: ${a.out}`);
  const r = chalk(d, 'verify');
  assert.equal(r.code, 0, `verify is GREEN again after the sanctioned re-lock: ${r.out}`);
  assert.match(r.out, /GREEN/);
  // The pin now matches the amended content — proof the re-lock took, not that the check was skipped.
  assert.equal(JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].tests[0].sha256, sha(join(d, 'contract.test.mjs')));
});
