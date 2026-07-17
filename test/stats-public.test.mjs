// Shareable, PII-free gate-efficacy artifact (#156). `chalk stats` already computes gate efficacy;
// `--public` renders it as an embeddable social-proof block — "the adversarial gate caught N changes
// the model's own self-check had passed" — with NO task titles, paths, or ids (the churn 'worst' list,
// the only titled field, is dropped). `--badge` emits shields.io endpoint JSON. Deterministic over a
// fixed spine fixture. Locked contract for #156.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const SECRET = 'SECRET-CLIENT-alpha-name'; // a distinctive task title that must NEVER leak into public output

// A spine with a caught task (blocked → passed) carrying a high attempt count — so it WOULD appear in
// the (excluded) churn 'worst' list by title — plus a plainly-passed task.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-statspub-'));
  execSync('git init -q', { cwd: d });
  chalk(d, 'init', '--name', 'p');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([
    { id: 'task-aaaaaaaa', title: SECRET, state: 'done', attempts: 3, doneAt: '2026-02-01T00:00:00Z',
      reviews: [{ verdict: 'block', findings: [{ severity: 'high', area: 'correctness' }] }, { verdict: 'pass', findings: [] }] },
    { id: 'task-bbbbbbbb', title: 'feat: b', state: 'done', doneAt: '2026-02-02T00:00:00Z', reviews: [{ verdict: 'pass', findings: [] }] },
  ]));
  return d;
}

test('--public renders the efficacy headline and leaks NO task titles/ids/paths', () => {
  const r = chalk(repo(), 'stats', '--public');
  assert.equal(r.code, 0, r.out);
  // Headline fields present.
  assert.match(r.out, /Gate catches/i);
  assert.match(r.out, /caught 1 change/i, 'one task was blocked then passed → 1 catch');
  assert.match(r.out, /Tasks reviewed/i);
  assert.match(r.out, /1 block \/ 2 pass/, 'verdict tally');
  assert.match(r.out, /disagreement.*50%/is, 'caught/reviewed = 1/2 = 50%');
  // No PII.
  assert.doesNotMatch(r.out, new RegExp(SECRET), 'a task title must never appear in --public output');
  assert.doesNotMatch(r.out, /task-aaaaaaaa|task-bbbbbbbb/, 'no task ids');
});

test('--badge emits valid shields.io endpoint JSON with the catch count', () => {
  const r = chalk(repo(), 'stats', '--badge');
  assert.equal(r.code, 0, r.out);
  const badge = JSON.parse(r.out.trim());
  assert.equal(badge.schemaVersion, 1);
  assert.equal(badge.label, 'gate catches');
  assert.equal(badge.message, '1');
  assert.equal(badge.color, 'brightgreen');
});

test('--public --json emits a PII-free summary object (no worst list, no titles)', () => {
  const r = chalk(repo(), 'stats', '--public', '--json');
  const pub = JSON.parse(r.out.trim());
  assert.equal(pub.catches, 1);
  assert.equal(pub.reviewed, 2);
  assert.deepEqual(pub.verdicts, { block: 1, pass: 2 });
  assert.ok(!('worst' in (pub.churn || {})), 'the titled churn.worst list is excluded');
  assert.doesNotMatch(JSON.stringify(pub), new RegExp(SECRET), 'no title anywhere in the object');
});

test('the README documents the public social-proof block', () => {
  assert.match(readFileSync(join(REPO_ROOT, 'README.md'), 'utf8'), /chalk stats --public/, 'README references the shareable artifact');
});
