// M1 — P7 blindness hardening. The held-out set only works if the implementing agent can NEVER see it.
// Two ways it can leak, two guards here:
//   1. A git worktree is a plain checkout, so any COMMITTED held-out file appears in the agent's sandbox
//      where it can read it — silently defeating the gate. `chalk doctor` must FAIL on git-tracked held-out.
//   2. `chalk audit` runs the held-out command but must WITHHOLD its stdout/stderr, so hidden assertions
//      never reach the agent to overfit to (only pass/fail escapes).
// Evidence: ImpossibleBench — hiding/isolating tests drops cheating to ~0; leaking them brings it back.
// Locked contract.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const git = (cwd, args) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' });
const conf = (d, fn) => {
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o.protocol);
  writeFileSync(f, JSON.stringify(o, null, 2));
};
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-blind-'));
  git(d, 'init -q'); git(d, 'config user.email t@t'); git(d, 'config user.name t');
  chalk(d, 'init', '--name', 'demo');
  return d;
}

test('doctor — FAILS (exit 2) when a held-out file is git-tracked (P7 blindness leak)', () => {
  const d = repo();
  conf(d, (p) => { p.executor = { command: 'true' }; }); // remove the unrelated "no executor" blocker
  mkdirSync(join(d, '.chalk/held-out'), { recursive: true });
  writeFileSync(join(d, '.chalk/held-out/secret.test.mjs'), 'export const x = 1;\n');
  git(d, 'add -f .chalk/held-out/secret.test.mjs'); // a committed held-out set is the leak we refuse
  const r = chalk(d, 'doctor');
  assert.match(r.out, /held-out[\s\S]*(track|leak|worktree)/i, 'doctor flags the tracked held-out file');
  assert.equal(r.code, 2, 'doctor exits 2 (NOT READY) — a tracked held-out set defeats the gate');
});

test('doctor — no leak warning when held-out is untracked (README aside)', () => {
  const d = repo();
  const r = chalk(d, 'doctor');
  assert.doesNotMatch(r.out, /held-out[\s\S]*track/i, 'untracked held-out is clean');
});

test('audit — the held-out command output is WITHHELD from the caller (blindness)', () => {
  const d = repo();
  const SECRET = 'SUPERSECRET_HELDOUT_ASSERTION';
  conf(d, (p) => {
    p.regression = { ...(p.regression || {}), command: `node -e "console.log('${SECRET}'); process.exit(0)"`, dir: '.chalk/held-out', required: true, tests: [] };
  });
  const r = chalk(d, 'audit');
  assert.ok(!r.out.includes(SECRET), 'the held-out command stdout must never reach the caller (P7 blindness)');
  assert.match(r.out, /AUDIT GREEN/, 'a passing held-out command is green');
});
