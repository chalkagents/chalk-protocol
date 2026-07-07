// Tamper-evident spine (#79), opt-in via protocol.tamperEvident. In manual mode nothing detected an
// agent hand-editing .chalk/tasks.json (mark-done-by-hand) or weakening chalk.json's verify
// commands — enforcement was pure process discipline. When enabled, chalk records the hashes of its
// authority files (chalk.json, tasks.json) in gitignored .chalk/local/ after every write; on the
// next invocation, an on-disk hash that differs from the recorded baseline means the file was
// changed OUTSIDE chalk, and chalk says so loudly and logs an event. It is tamper-EVIDENCE, not a
// lock: after warning it re-baselines so the notice fires once. This suite pins: the feature is off
// by default (no behavior change), chalk's own writes never false-positive when on, an outside edit
// to either file is caught with a loud warning + logged event, the warning fires exactly once, and
// a first enabled run with no baseline is fail-safe. Locked contract for the task tracking issue #79.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const readTasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
const events = (d) => readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const enableTamper = (d) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); o.protocol.tamperEvident = true; writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };

// A spine with one task, created entirely through chalk with tamper-evidence ENABLED, then a
// chalk write (task add) to establish the first baseline through chalk's own path.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-tamper-'));
  chalk(d, 'init', '--name', 'demo');
  enableTamper(d);
  chalk(d, 'task', 'add', 'T'); // first enabled write → baseline recorded
  chalk(d, 'spec', readTasks(d)[0].id, '--criterion', 'x');
  return d;
}
// Hand-edit tasks.json outside chalk — the mark-done-by-hand cheat.
function handEditTasks(d, fn) {
  const t = readTasks(d); fn(t);
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(t, null, 2) + '\n');
}

test('enabled — the first chalk write baselines; chalk-only operations never trip the tamper warning', () => {
  const d = repo();
  assert.ok(existsSync(join(d, '.chalk/local/spine.hashes.json')), 'a baseline is recorded once enabled');
  // A sequence of ordinary chalk commands (each re-baselines its own write) — no warning ever.
  for (const args of [['next'], ['status'], ['task', 'add', 'U'], ['backlog']]) {
    const r = chalk(d, ...args);
    assert.doesNotMatch(r.out, /modified outside chalk/i, `\`chalk ${args.join(' ')}\` must not warn: ${r.out}`);
  }
});

test('an outside edit to tasks.json is caught with a loud warning + a logged event, then re-baselined', () => {
  const d = repo();
  handEditTasks(d, (t) => { t[0].state = 'done'; t[0].doneAt = '2026-01-01T00:00:00Z'; }); // mark-done-by-hand
  const r1 = chalk(d, 'next');
  assert.match(r1.out, /tasks\.json.*modified outside chalk/i, 'the hand-edit is detected and named');
  const ev = events(d).filter((e) => /tamper-evidence/i.test(e.title));
  assert.equal(ev.length, 1, 'exactly one tamper event was logged');
  assert.match(ev[0].title, /tasks\.json/, 'the event names the drifted file');
  // Evidence, not a lock: the SAME state no longer warns on the next run (it re-baselined).
  const r2 = chalk(d, 'next');
  assert.doesNotMatch(r2.out, /modified outside chalk/i, 'the warning fires once, not every run');
});

test('an outside edit to chalk.json (weakening a verify command) is caught too', () => {
  const d = repo();
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  o.protocol.verify = { ...o.protocol.verify, test: 'true' }; // silently neuter the gate
  writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
  const r = chalk(d, 'status');
  assert.match(r.out, /chalk\.json.*modified outside chalk/i, 'a hand-weakened config is flagged');
});

test('fail-safe — a spine with no baseline yet never warns (fresh/upgraded repo)', () => {
  const d = repo();
  // Simulate an upgrade: no baseline file exists, but the spine does.
  const hashes = join(d, '.chalk/local/spine.hashes.json');
  writeFileSync(hashes, JSON.stringify({ at: '2026-01-01T00:00:00Z', hashes: {} })); // present but empty
  handEditTasks(d, (t) => { t[0].state = 'done'; });
  const r = chalk(d, 'next');
  assert.doesNotMatch(r.out, /modified outside chalk/i, 'no recorded hash for a file → nothing to compare');
});
