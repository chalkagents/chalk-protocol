// Tamper-evident spine (#79), opt-in via protocol.tamperEvident. In manual mode nothing detected an
// agent hand-editing .chalk/tasks.json (mark-done-by-hand) or weakening chalk.json's verify
// commands — enforcement was pure process discipline. When enabled, chalk records the hashes of its
// authority files (chalk.json, tasks.json) in gitignored .chalk/local/ after every write; on the
// next invocation, an on-disk hash that differs from the recorded baseline means the file was
// changed OUTSIDE chalk, and chalk says so loudly and logs an event. It is tamper-EVIDENCE, not a
// lock: after warning it re-baselines so the notice fires once. This suite pins the full contract:
// default-OFF is inert (no hashing, no warning, no new files — criteria 1/4), an enabled run with
// no baseline establishes one without warning (fail-safe — criterion 3), chalk's own writes never
// false-positive, an outside edit to EITHER file is caught (warning + logged event), the warning
// fires exactly once per state and re-arms for a fresh edit. Locked contract for issue #79.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const HASHES = '.chalk/local/spine.hashes.json';
const readTasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
const events = (d) => readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const tamperEvents = (d) => events(d).filter((e) => /tamper-evidence/i.test(e.title || ''));
const setTamper = (d, on) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); o.protocol.tamperEvident = on; writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const handEditTasks = (d, fn) => { const t = readTasks(d); fn(t); writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify(t, null, 2) + '\n'); };

// A fresh spine with one specd task, feature OFF (chalk's default).
function baseRepo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-tamper-'));
  chalk(d, 'init', '--name', 'demo');
  chalk(d, 'task', 'add', 'T');
  chalk(d, 'spec', readTasks(d)[0].id, '--criterion', 'x');
  return d;
}
// Enabled + baseline established through chalk's own write path.
function enabledRepo() {
  const d = baseRepo();
  setTamper(d, true);
  chalk(d, 'task', 'add', 'U'); // first enabled write → baseline recorded through saveTasks
  return d;
}

test('default OFF — inert: no hashing, no warning, no new files even when tasks.json is hand-edited', () => {
  const d = baseRepo();
  assert.ok(!existsSync(join(d, HASHES)), 'feature off → chalk never records a baseline');
  handEditTasks(d, (t) => { t[0].state = 'done'; t[0].doneAt = '2026-01-01T00:00:00Z'; }); // mark-done-by-hand
  const before = readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8');
  for (const args of [['next'], ['status'], ['backlog']]) {
    const r = chalk(d, ...args);
    assert.doesNotMatch(r.out, /modified outside chalk/i, `off: \`chalk ${args.join(' ')}\` must not warn`);
  }
  assert.ok(!existsSync(join(d, HASHES)), 'off: no baseline file is ever created');
  assert.equal(readFileSync(join(d, '.chalk/updates.jsonl'), 'utf8'), before, 'off: no tamper event is logged');
});

test('enabled, no baseline yet — the first run establishes one WITHOUT warning (fail-safe)', () => {
  const d = baseRepo();
  setTamper(d, true); // enabled by hand; no chalk write since, so no baseline exists
  assert.ok(!existsSync(join(d, HASHES)), 'no baseline before the first enabled invocation');
  const r = chalk(d, 'next'); // first enabled run, read-only
  assert.doesNotMatch(r.out, /modified outside chalk/i, 'first run with no baseline must not warn');
  assert.ok(existsSync(join(d, HASHES)), 'the first enabled run establishes the baseline');
  assert.equal(tamperEvents(d).length, 0, 'no tamper event on the establishing run');
});

test('enabled — chalk-only operations never trip the tamper warning', () => {
  const d = enabledRepo();
  for (const args of [['next'], ['status'], ['task', 'add', 'V'], ['backlog']]) {
    const r = chalk(d, ...args);
    assert.doesNotMatch(r.out, /modified outside chalk/i, `\`chalk ${args.join(' ')}\` must not warn: ${r.out}`);
  }
  assert.equal(tamperEvents(d).length, 0, 'no spurious tamper events from chalk itself');
});

test('enabled — an outside edit to tasks.json is caught (warning + logged event), then fires once', () => {
  const d = enabledRepo();
  handEditTasks(d, (t) => { t[0].state = 'done'; t[0].doneAt = '2026-01-01T00:00:00Z'; });
  const r1 = chalk(d, 'next');
  assert.match(r1.out, /tasks\.json.*modified outside chalk/i, 'the hand-edit is detected and named');
  assert.equal(tamperEvents(d).length, 1, 'exactly one tamper event logged');
  assert.match(tamperEvents(d)[0].title, /tasks\.json/, 'the event names the drifted file');
  const r2 = chalk(d, 'next');
  assert.doesNotMatch(r2.out, /modified outside chalk/i, 'the warning fires once, not every run');
  assert.equal(tamperEvents(d).length, 1, 'no second event for the same state');
});

test('enabled — a hand-weakened chalk.json is caught too, and a fresh edit re-arms the warning', () => {
  const d = enabledRepo();
  setTamper(d, true); // rewrite chalk.json (also neuters nothing here, just drifts the hash) — still enabled
  const veri = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(veri, 'utf8')); o.protocol.verify = { ...o.protocol.verify, test: 'true' }; // silently neuter the gate
  writeFileSync(veri, JSON.stringify(o, null, 2) + '\n');
  const r1 = chalk(d, 'status');
  assert.match(r1.out, /chalk\.json.*modified outside chalk/i, 'a hand-weakened config is flagged');
  const n1 = tamperEvents(d).length;
  // A SECOND, different outside edit must warn again (re-armed after the re-baseline).
  handEditTasks(d, (t) => { t[0].title = 'renamed by hand'; });
  const r2 = chalk(d, 'status');
  assert.match(r2.out, /tasks\.json.*modified outside chalk/i, 'a fresh edit re-arms and warns again');
  assert.equal(tamperEvents(d).length, n1 + 1, 'the fresh edit logs its own event');
});
