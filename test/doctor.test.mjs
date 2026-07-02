// `chalk doctor` for strangers — a preflight that ends in a copy-paste fix, not a search, and
// that never scares a manual-loop user away:
//   - missing gh/git → per-OS install hints, with gh explicitly scoped to the PR pipeline;
//   - no executor stays a FAIL (autopilot gates on it) but the message says it's OPTIONAL for the
//     manual loop and spells the loop out;
//   - the opt-in levers nudge (info) names exactly the strongest gates that are OFF;
//   - --json is the stable bug-report format the issue templates ask for (exit code preserved);
//   - a NOT READY verdict is explicitly scoped to unattended runs.
// Locked contract for task-2a7025b.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runDoctor, installHint } from '../lib/doctor.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'doctor-'));

// A minimal store stub in a non-git dir: doctor only reads protocol()/tasks()/root.
const stubStore = (proto = {}) => ({
  root: scratch(),
  protocol: () => ({ github: {}, verify: { test: 'node --test' }, executor: { command: '' }, review: {}, regression: {}, plan: {}, worktree: { enabled: false }, ...proto }),
  tasks: () => [],
});

test('installHint — per-OS, copy-paste ready, empty for unknown binaries', () => {
  assert.match(installHint('gh', 'darwin'), /brew install gh/);
  assert.match(installHint('gh', 'win32'), /winget install GitHub\.cli/);
  assert.match(installHint('gh', 'linux'), /github\.com\/cli/);
  assert.match(installHint('git', 'darwin'), /xcode-select|brew/);
  assert.equal(installHint('some-unknown-tool', 'darwin'), '');
  assert.match(installHint('node /path/to/fake-gh.mjs', 'darwin'), /^$/, 'a custom gh stub command gets no bogus hint');
});

test('doctor WIRING — a missing gh/git fail line carries the hint and the pipeline-only scoping', () => {
  // Scrub PATH so onPath() genuinely misses gh/git (execSync still finds /bin/sh absolutely).
  const oldPath = process.env.PATH;
  process.env.PATH = '';
  let results;
  try { results = runDoctor(stubStore({ github: { command: 'gh' } })); }
  finally { process.env.PATH = oldPath; }
  const gh = results.find((r) => r.area === 'toolchain' && /^gh /.test(r.msg) && r.level === 'fail');
  assert.ok(gh, 'gh missing → fail entry');
  assert.match(gh.msg, /install:/, 'the per-OS hint is interpolated into the doctor line');
  assert.match(gh.msg, /needed for the issue\/PR pipeline, NOT for the local loop/);
  const git = results.find((r) => r.area === 'toolchain' && /^git not found/.test(r.msg));
  assert.match(git.msg, /install:/, 'git gets a hint too');

  // A custom (stub) gh command has no hint — the line must not dangle an em-dash.
  process.env.PATH = '';
  let custom;
  try { custom = runDoctor(stubStore({ github: { command: 'my-fake-gh-xyz' } })); }
  finally { process.env.PATH = oldPath; }
  const c = custom.find((r) => r.area === 'toolchain' && /my-fake-gh-xyz/.test(r.msg));
  assert.doesNotMatch(c.msg, /— \(/, 'no dangling em-dash when no hint exists');
});

test('no executor — still a FAIL for autonomy, but framed OPTIONAL with the manual loop spelled out', () => {
  const results = runDoctor(stubStore());
  const ex = results.find((r) => r.area === 'executor');
  assert.equal(ex.level, 'fail', 'autopilot gates on this — the level must stay fail');
  assert.match(ex.msg, /OPTIONAL for the manual loop/);
  assert.match(ex.msg, /chalk next → write code → chalk verify → chalk done/);
});

test('opt-in levers nudge — an info line names exactly the strong gates that are OFF', () => {
  const allOff = runDoctor(stubStore());
  const nudge = allOff.find((r) => r.level === 'info' && /opt-in levers OFF/.test(r.msg));
  assert.ok(nudge, 'the nudge exists when levers are off');
  for (const named of ['breakTest', 'mutation', 'held-out', 'review', 'plan-approval']) {
    assert.match(nudge.msg, new RegExp(named), `names ${named}`);
  }
  const armed = runDoctor(stubStore({ breakTest: 'node --test {test}' }));
  const nudge2 = armed.find((r) => r.level === 'info' && /opt-in levers OFF/.test(r.msg));
  assert.ok(nudge2 && !/breakTest/.test(nudge2.msg), 'an armed lever drops out of the nudge');

  const allArmed = runDoctor(stubStore({
    breakTest: 'node --test {test}', mutation: 'npx stryker run --mutate {file}',
    regression: { command: 'node --test .chalk/held-out' },
    review: { command: 'x', requiredAt: ['per-task'] }, plan: { required: true },
  }));
  assert.ok(!allArmed.some((r) => r.level === 'info' && /opt-in levers OFF/.test(r.msg)),
    'everything armed → no nudge at all');
});

test('chalk doctor --json — stable bug-report shape, exit code preserved', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 't', '--bare');
  const r = chalk(d, 'doctor', '--json');
  assert.equal(r.code, 2, 'non-git scratch with no executor is NOT READY (exit 2) in json mode too');
  const o = JSON.parse(r.out);
  assert.ok(Array.isArray(o.results) && o.results.length, 'results[] present');
  assert.ok(o.node.startsWith('v') && o.platform && o.at, 'environment triage fields present');
  assert.ok(o.results.some((x) => x.level === 'fail'), 'the failing checks are in the payload');
});

test('NOT READY is scoped to unattended runs — the manual loop is offered, not blocked', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 't', '--bare');
  const r = chalk(d, 'doctor');
  assert.equal(r.code, 2);
  assert.match(r.out, /NOT READY concerns UNATTENDED runs/);
  assert.match(r.out, /the manual loop works regardless: chalk next/);
});

test('--json exit parity — a READY project exits 0 in both modes, info nudge never gates', () => {
  const d = scratch();
  spawnSync('git', ['init', '-b', 'main'], { cwd: d });
  chalk(d, 'init', '--name', 't', '--bare');
  const f = join(d, '.chalk', 'chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  writeFileSync(join(d, 'stub-gh.mjs'), 'process.exit(0);\n'); // "authenticated" gh stand-in
  Object.assign(o.protocol, {
    github: { ...o.protocol.github, command: `node ${join(d, 'stub-gh.mjs')}` },
    executor: { command: 'node -e ""' },
    worktree: { enabled: false },
  });
  writeFileSync(f, JSON.stringify(o, null, 2));
  const j = chalk(d, 'doctor', '--json');
  assert.equal(j.code, 0, `READY must exit 0 under --json: ${j.out.slice(0, 600)}`);
  const parsed = JSON.parse(j.out);
  assert.ok(!parsed.results.some((r) => r.level === 'fail'), 'no fails in the payload');
  assert.ok(parsed.results.some((r) => r.level === 'info'), 'the info nudge is present yet does not gate');
  const p = chalk(d, 'doctor');
  assert.equal(p.code, 0, 'pretty mode agrees with json mode on the exit code');
});
