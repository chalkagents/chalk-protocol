// Vacuous-verify trap enforced at the readiness gate (#152). An empty protocol.verify makes every
// `chalk verify` print GREEN while running NOTHING — so a runnable task auto-passes P4 even WITH a
// locked test (the test is never executed). This was only warned at init, never enforced; an
// unattended `chalk autopilot`/`chalk doctor` preflight would rubber-stamp it. doctor now reports a
// blocking 'fail' (softened to 'warn' when an adversarial reviewer backstops it), so autopilot (which
// gates on doctor fails) and the `chalk doctor` preflight refuse. Locked contract for #152.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../lib/doctor.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };

// A store stub: doctor only reads protocol()/tasks()/root. One runnable (specd) task WITH a locked
// test — so the ONLY thing making its verify vacuous is the empty protocol.verify, not a missing test.
const stub = (proto = {}) => ({
  root: mkdtempSync(join(tmpdir(), 'doc-vac-')),
  protocol: () => ({ github: {}, verify: {}, executor: { command: '' }, review: {}, regression: {}, plan: {}, worktree: { enabled: false }, ...proto }),
  tasks: () => [{ id: 'task-aaaaaaaa', title: 'feat: a', state: 'specd', after: [], tests: [{ path: 'test/a.test.mjs', sha256: 'x' }] }],
});
const vacuousFinding = (results) => results.find((r) => /verify is empty|VACUOUSLY/i.test(r.msg));

test('empty protocol.verify + a runnable task (even WITH a test) → doctor FAIL blocker', () => {
  const f = vacuousFinding(runDoctor(stub()));
  assert.ok(f, 'the empty-verify vacuity is reported');
  assert.equal(f.level, 'fail', 'no reviewer backstop → it blocks autonomous runs (autopilot gates on fails)');
});

test('a reviewer gate softens the empty-verify finding to a warning (the backstop)', () => {
  const f = vacuousFinding(runDoctor(stub({ review: { command: 'echo', requiredAt: ['per-task'] } })));
  assert.ok(f, 'still reported');
  assert.equal(f.level, 'warn', 'a configured adversarial reviewer can still catch an untested change');
});

test('a CONFIGURED verify produces no vacuity finding (no false positive)', () => {
  assert.equal(vacuousFinding(runDoctor(stub({ verify: { test: 'node --test' } }))), undefined);
});

test('the finding is independent of the per-task testless check — it fires for a fully-tested task', () => {
  // The task HAS a test, so the existing testless check stays silent; the empty-verify check must still fire.
  const results = runDoctor(stub());
  assert.ok(!results.some((r) => /has no locked test/.test(r.msg)), 'testless check does not fire (task has a test)');
  assert.ok(vacuousFinding(results), 'yet the empty-verify vacuity is still caught');
});

test('chalk doctor exits non-zero on the empty-verify blocker (autonomous preflight refuses)', () => {
  const d = mkdtempSync(join(tmpdir(), 'doc-vac-cli-'));
  spawnSync('git', ['init', '-q'], { cwd: d });
  chalk(d, 'init', '--name', 'p'); // no preset → empty verify
  mkdirSync(join(d, 'test'), { recursive: true });
  writeFileSync(join(d, 'test/a.test.mjs'), 'export const a = 1;\n');
  chalk(d, 'task', 'add', 'feat: a');
  const id = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0].id;
  chalk(d, 'spec', id, '--test', 'test/a.test.mjs'); // → specd (runnable) with a locked test
  const r = chalk(d, 'doctor');
  assert.notEqual(r.code, 0, 'doctor must exit non-zero so a preflight/autopilot refuses');
  assert.match(r.out, /verify is empty|VACUOUSLY/i, 'the vacuous-verify blocker is surfaced');
});
