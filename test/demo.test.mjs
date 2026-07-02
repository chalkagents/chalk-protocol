// `chalk demo` — the 1-minute stub-agent lifecycle demo, doubling as the standing end-to-end
// canary: discover → plan → approval gate → work → lock → P6 tamper-catch → review → done →
// release → feedback → portal, with TWO staged gate refusals. The demo self-asserts (an expected
// refusal that passes throws), so this test mostly pins the contract a first-time user sees:
// it exits 0, the refusals are visible, the P6 catch is shown, and the temp project is cleaned
// up (or kept with --keep). Locked contract for task-6c33ba1.
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const runDemo = (args = [], env = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), 'demo-cwd-')); // neutral cwd: demo must not need a chalk project
  const r = spawnSync('node', [CLI, 'demo', ...args], { cwd, encoding: 'utf8', timeout: 4 * 60 * 1000, env: { ...process.env, ...env } });
  return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) };
};
const demoDirOf = (out) => out.match(/Throwaway demo project: (\S+)/)?.[1];

test('chalk demo — full lifecycle green with two visible gate refusals, then cleans up', () => {
  const r = runDemo();
  assert.equal(r.code, 0, `demo must exit 0:\n${r.out.slice(-2000)}`);
  assert.equal((r.out.match(/GATE REFUSED/g) || []).length, 2, 'exactly two staged refusals are shown');
  assert.match(r.out, /LOOP COMPLETE — 2 gates refused/);
  // Refusal IDENTITY, not just count: #1 is the plan-approval gate, #2 the P6 tamper-catch.
  assert.match(r.out, /plan not approved/, 'refusal #1 is the plan-approval gate speaking, not some other error');
  assert.match(r.out, /test-integrity VIOLATED \(P6\)/, 'refusal #2: the tampered locked test is caught on-screen');
  assert.match(r.out, /restored the locked test[\s\S]*amend-spec/, 'the restore narrative names the sanctioned edit path');
  const dir = demoDirOf(r.out);
  assert.ok(dir, 'the demo prints its temp project path');
  assert.ok(!existsSync(dir), 'the throwaway project is cleaned up by default');
});

test('chalk demo — a mid-demo failure KEEPS the project and prints its path (nonzero exit)', () => {
  const r = runDemo([], { CHALK_DEMO_SABOTAGE: '1' });
  assert.notEqual(r.code, 0, 'a broken stage must not exit 0');
  assert.match(r.out, /demo project kept for inspection/);
  const dir = demoDirOf(r.out);
  assert.ok(dir && existsSync(dir), 'the project survives a failure for post-mortem');
  rmSync(dir, { recursive: true, force: true });
});

test('chalk demo — single source of truth: the .sh wrapper delegates and help lists it', () => {
  const sh = readFileSync(join(ROOT, 'examples', 'lifecycle-demo.sh'), 'utf8');
  assert.match(sh, /chalk\.mjs" demo/, 'lifecycle-demo.sh must delegate to `chalk demo`, not duplicate the stages');
  assert.ok(sh.length < 1000, 'the wrapper stays a wrapper');
  const help = strip(spawnSync('node', [CLI, 'help'], { encoding: 'utf8' }).stdout || '');
  assert.match(help, /chalk demo \[--keep\]/, 'help advertises the demo under setup');
});

test('chalk demo --keep — keeps the throwaway project for inspection', () => {
  const r = runDemo(['--keep']);
  assert.equal(r.code, 0, `demo --keep must exit 0:\n${r.out.slice(-2000)}`);
  assert.match(r.out, /Kept the demo project at/);
  const dir = demoDirOf(r.out);
  assert.ok(dir && existsSync(dir), 'the project survives with --keep');
  assert.ok(existsSync(join(dir, '.chalk', 'chalk.json')), 'and is a real chalk project');
  rmSync(dir, { recursive: true, force: true });
});
