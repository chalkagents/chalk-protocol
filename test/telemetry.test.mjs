// Locked contract for opt-in anonymous telemetry (#154). The invariants that MUST hold:
//   1. OFF unless explicitly enabled (opt-in) — and no install-id is written while off.
//   2. When enabled, the payload contains ONLY the whitelisted fields (no code/paths/repo identity).
//   3. A network failure never throws / never affects a command's exit code (fire-and-forget).
//   4. Each milestone fires at most once; env kill switch + CI hard-disable.
//   5. `chalk telemetry --show` prints exactly what would be sent.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  telemetryEnabled, buildPayload, whitelistPayload, installId, emitMilestone, telemetryStatus,
  promptTelemetryOptIn, TELEMETRY_FIELDS, TELEMETRY_EVENTS,
} from '../lib/telemetry.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const stateFile = () => join(mkdtempSync(join(tmpdir(), 'telemetry-')), 'telemetry.json');

// Async run so an in-process HTTP collector can serve the child's awaited POST (a synchronous spawnSync
// would deadlock: the child waits on a server whose event loop is blocked by spawnSync).
const runAsync = (cwd, env, ...args) => new Promise((resolve) => {
  const c = spawn('node', [CLI, ...args], { cwd, env, encoding: 'utf8' });
  let out = '';
  c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
  c.on('close', (code) => resolve({ code, out: strip(out) }));
});
// A telemetry collector that records every received JSON body.
const collector = async () => {
  const received = [];
  const server = createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { try { received.push(JSON.parse(b)); } catch { /* ignore */ } res.writeHead(200); res.end('ok'); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { received, url: `http://127.0.0.1:${server.address().port}/e`, close: () => server.close() };
};
// Drive a task to `done` in a freshly-inited spine.
async function toDone(d, env) {
  await runAsync(d, env, 'task', 'add', 'ship it');
  const t = JSON.parse(readFileSync(join(d, '.chalk', 'tasks.json'), 'utf8')).find((x) => x.title === 'ship it');
  const id = t.id.slice(0, 12);
  await runAsync(d, env, 'spec', id, '--criterion', 'works');
  await runAsync(d, env, 'start', id);
  const verify = await runAsync(d, env, 'verify');
  const done = await runAsync(d, env, 'done', id);
  return { id, verify, done };
}
const chalkjson = (d) => JSON.parse(readFileSync(join(d, '.chalk', 'chalk.json'), 'utf8'));

test('telemetryEnabled — OFF by default; opt-in required; env + CI hard-disable', () => {
  assert.equal(telemetryEnabled({ config: undefined, env: {} }), false, 'no config → OFF');
  assert.equal(telemetryEnabled({ config: {}, env: {} }), false, 'config present but not enabled → OFF');
  assert.equal(telemetryEnabled({ config: { enabled: false }, env: {} }), false, 'enabled:false → OFF');
  assert.equal(telemetryEnabled({ config: { enabled: true }, env: {} }), true, 'explicit opt-in → ON');
  assert.equal(telemetryEnabled({ config: { enabled: true }, env: { CI: '1' } }), false, 'CI strips telemetry');
  assert.equal(telemetryEnabled({ config: { enabled: true }, env: { CHALK_TELEMETRY: '0' } }), false, 'CHALK_TELEMETRY=0 kills it');
  assert.equal(telemetryEnabled({ config: { enabled: true }, env: { CHALK_TELEMETRY: 'false' } }), false, 'CHALK_TELEMETRY=false kills it');
  assert.equal(telemetryEnabled({ config: { enabled: true }, env: { CHALK_TELEMETRY: 'off' } }), false, 'CHALK_TELEMETRY=off kills it');
});

test('promptTelemetryOptIn — affirmative consent only; default N; inert when non-interactive', () => {
  const P = (opts) => promptTelemetryOptIn(opts);
  // non-interactive / opted-out contexts never prompt (and never even read stdin)
  let reads = 0; const spyRead = () => { reads++; return 'y'; };
  assert.equal(P({ isTTY: false, read: spyRead }), false, 'non-TTY (pipe/CI/test) → decline');
  assert.equal(reads, 0, 'declined without reading stdin');
  assert.equal(P({ isTTY: true, env: { CI: '1' }, read: () => 'y' }), false, 'CI → decline');
  assert.equal(P({ isTTY: true, env: { CHALK_TELEMETRY: '0' }, read: () => 'y' }), false, 'kill switch → decline');
  // interactive: ONLY an affirmative accepts
  assert.equal(P({ isTTY: true, read: () => 'y\n' }), true, '"y" accepts');
  assert.equal(P({ isTTY: true, read: () => 'yes\n' }), true, '"yes" accepts');
  assert.equal(P({ isTTY: true, read: () => 'Y' }), true, 'case-insensitive');
  assert.equal(P({ isTTY: true, read: () => '' }), false, 'EOF / empty → decline (default N)');
  assert.equal(P({ isTTY: true, read: () => 'n' }), false, '"n" declines');
  assert.equal(P({ isTTY: true, read: () => 'sure' }), false, 'anything non-affirmative → decline');
  let asked = ''; P({ isTTY: true, read: () => 'n', write: (s) => (asked += s) });
  assert.match(asked, /anonymous usage stats/i, 'the consent question is shown');
});

test('telemetryStatus — ENABLED / kill-switch rendering for `--show`', () => {
  const f = stateFile();
  const on = telemetryStatus({ config: { enabled: true }, env: {}, stateFile: f, version: '1', now: 'T' });
  assert.equal(on.enabled, true);
  assert.equal(on.optedIn, true);
  assert.equal(on.killSwitch, null);
  assert.equal(on.nextEvent, 'init', 'fresh install → next milestone is init');
  const killed = telemetryStatus({ config: { enabled: true }, env: { CHALK_TELEMETRY: 'off' }, stateFile: f, version: '1', now: 'T' });
  assert.equal(killed.enabled, false, 'opted in but env-killed → not enabled');
  assert.equal(killed.optedIn, true);
  assert.equal(killed.killSwitch, 'CHALK_TELEMETRY');
  assert.equal(telemetryStatus({ config: { enabled: true }, env: { CI: '1' }, stateFile: f, version: '1', now: 'T' }).killSwitch, 'CI');
});

test('payload contains ONLY the whitelisted fields — never repo identity or free-form data', () => {
  const p = buildPayload({ event: 'init', version: '1.2.3', installId: 'anon-xyz', ts: 'T' });
  assert.deepEqual(Object.keys(p).sort(), [...TELEMETRY_FIELDS].sort(), 'exactly the whitelist keys');
  assert.deepEqual(TELEMETRY_FIELDS, ['event', 'version', 'installId', 'ts']);
  // whitelistPayload strips anything a buggy caller sneaks in (defense in depth)
  const cleaned = whitelistPayload({ ...p, cwd: '/secret/repo', diff: 'code', apiKey: 'nope' });
  assert.deepEqual(Object.keys(cleaned).sort(), [...TELEMETRY_FIELDS].sort(), 'extra fields dropped');
  assert.equal(cleaned.diff, undefined);
  assert.equal(cleaned.cwd, undefined);
});

test('OFF: emitMilestone is inert and writes NO install-id / state file', async () => {
  const file = stateFile();
  let sent = 0;
  const out = await emitMilestone({ event: 'init', config: { enabled: false }, env: {}, stateFile: file, version: '1.0.0', now: 'T', send: async () => { sent++; } });
  assert.equal(out, null, 'disabled → nothing emitted');
  assert.equal(sent, 0, 'disabled → no network');
  assert.equal(existsSync(file), false, 'disabled → no install-id / state file written');
  assert.equal(installId(file, { create: false }), null, 'no id materialized while off');
});

test('ENABLED: emits a whitelist-only payload with a random anonymous install id', async () => {
  const file = stateFile();
  const seen = [];
  const out = await emitMilestone({ event: 'init', config: { enabled: true }, env: {}, stateFile: file, version: '2.0.0', now: 'T1', gen: () => 'anon-fixed', send: async (_ep, p) => seen.push(p) });
  assert.deepEqual(Object.keys(out).sort(), [...TELEMETRY_FIELDS].sort());
  assert.equal(out.event, 'init');
  assert.equal(out.version, '2.0.0');
  assert.equal(out.installId, 'anon-fixed');
  assert.equal(seen.length, 1, 'sent exactly once');
  assert.deepEqual(seen[0], out, 'the sent body is the whitelisted payload');
});

test('a network failure NEVER throws and NEVER affects the caller (fire-and-forget)', async () => {
  const file = stateFile();
  // send rejects (DNS/timeout/unreachable) — emitMilestone must still resolve, not reject.
  const out = await emitMilestone({ event: 'done', config: { enabled: true }, env: {}, stateFile: file, version: '1.0.0', now: 'T', send: async () => { throw new Error('ENETDOWN'); } });
  assert.equal(out, null, 'a failed send resolves to null, does not throw');
  // a synchronously-throwing sender is equally contained
  await assert.doesNotReject(() => emitMilestone({ event: 'verify', config: { enabled: true }, env: {}, stateFile: file, version: '1.0.0', now: 'T', send: () => { throw new Error('boom'); } }));
});

test('each milestone fires at most once per install', async () => {
  const file = stateFile();
  let sent = 0;
  const args = { event: 'verify', config: { enabled: true }, env: {}, stateFile: file, version: '1.0.0', now: 'T', gen: () => 'id', send: async () => { sent++; } };
  await emitMilestone({ ...args });
  await emitMilestone({ ...args });
  await emitMilestone({ ...args });
  assert.equal(sent, 1, 'the same milestone is reported only once');
  assert.equal(installId(file, { create: false }), 'id', 'install id persisted after first emit');
});

test('unknown events are rejected (only the funnel milestones are ever sent)', async () => {
  const file = stateFile();
  let sent = 0;
  const out = await emitMilestone({ event: 'secret-event', config: { enabled: true }, env: {}, stateFile: file, version: '1.0.0', now: 'T', send: async () => { sent++; } });
  assert.equal(out, null);
  assert.equal(sent, 0);
  assert.deepEqual(TELEMETRY_EVENTS, ['init', 'verify', 'done']);
});

test('telemetryStatus / `chalk telemetry --show` — reports OFF by default and the exact whitelist', () => {
  const st = telemetryStatus({ config: undefined, env: {}, stateFile: stateFile(), version: '1.0.0', now: 'T' });
  assert.equal(st.enabled, false, 'off by default');
  assert.deepEqual(st.fields, TELEMETRY_FIELDS);
  assert.deepEqual(Object.keys(st.samplePayload).sort(), [...TELEMETRY_FIELDS].sort(), 'sample payload is whitelist-only');
});

test('CLI: `chalk telemetry` prints OFF-by-default state and the field whitelist (no network)', () => {
  const d = mkdtempSync(join(tmpdir(), 'telemetry-cli-'));
  const init = spawnSync('node', [CLI, 'init', '--name', 't', '--bare'], { cwd: d, encoding: 'utf8' });
  assert.equal(init.status, 0, 'init ok');
  // telemetry is OFF by default in a fresh spine
  const proto = JSON.parse(readFileSync(join(d, '.chalk', 'chalk.json'), 'utf8')).protocol;
  assert.equal(proto.telemetry.enabled, false, 'default config is opt-out');
  const r = spawnSync('node', [CLI, 'telemetry', '--show'], { cwd: d, encoding: 'utf8' });
  const out = strip(`${r.stdout || ''}${r.stderr || ''}`);
  assert.equal(r.status, 0, 'telemetry --show exits 0');
  assert.match(out, /OFF/, 'shows OFF state');
  assert.match(out, /event, version, installId, ts/, 'lists the exact whitelist');
  assert.doesNotMatch(out, /ENABLED/, 'not enabled by default');
  // no install-id state file should exist just from `--show` while off
  assert.equal(existsSync(join(d, '.chalk', 'local', 'telemetry.json')), false, 'no state written by --show while off');
});

test('CLI: `chalk init --no-telemetry` stays OFF without prompting', () => {
  const d = mkdtempSync(join(tmpdir(), 'telemetry-noflag-'));
  const r = spawnSync('node', [CLI, 'init', '--name', 't', '--no-telemetry', '--bare'], { cwd: d, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(chalkjson(d).protocol.telemetry.enabled, false, '--no-telemetry keeps it off');
});

test('CLI: `chalk telemetry --show` renders the ENABLED state after opt-in', () => {
  const d = mkdtempSync(join(tmpdir(), 'telemetry-onshow-'));
  // opt in non-interactively; point the (best-effort) init emit at a refused port so no real network is hit
  const env = { ...process.env, CI: '', CHALK_TELEMETRY: '', CHALK_TELEMETRY_ENDPOINT: 'http://127.0.0.1:1/e' };
  const init = spawnSync('node', [CLI, 'init', '--name', 't', '--telemetry', '--bare'], { cwd: d, env, encoding: 'utf8' });
  assert.equal(init.status, 0);
  assert.equal(chalkjson(d).protocol.telemetry.enabled, true);
  const r = spawnSync('node', [CLI, 'telemetry', '--show'], { cwd: d, env, encoding: 'utf8' });
  const out = strip(`${r.stdout || ''}${r.stderr || ''}`);
  assert.equal(r.status, 0);
  assert.match(out, /ENABLED/, 'shows the enabled state');
  assert.match(out, /opted in:\s+yes/, 'reports opt-in');
  assert.match(out, /event, version, installId, ts/, 'still lists the exact whitelist');
});

test('CLI end-to-end (opted in): init/verify/done deliver ONLY the whitelisted milestones, once each', async () => {
  const c = await collector();
  try {
    const d = mkdtempSync(join(tmpdir(), 'telemetry-e2e-'));
    const env = { ...process.env, CI: '', CHALK_TELEMETRY: '', CHALK_TELEMETRY_ENDPOINT: c.url };
    // Opt in non-interactively at init + a trivially-green verify command.
    const init = await runAsync(d, env, 'init', '--name', 't', '--telemetry', '--verify-test', 'node -e "process.exit(0)"');
    assert.equal(init.code, 0, 'init exits 0');
    assert.equal(chalkjson(d).protocol.telemetry.enabled, true, 'opting in flips the config flag');
    const { verify, done } = await toDone(d, env);
    assert.equal(verify.code, 0, 'verify exits 0');
    assert.equal(done.code, 0, 'done exits 0');
    // a SECOND verify + done must NOT re-emit (once-per-milestone, recorded only on delivery)
    await runAsync(d, env, 'verify');
    const events = c.received.map((p) => p.event);
    assert.deepEqual([...events].sort(), ['done', 'init', 'verify'], 'exactly the three funnel milestones, once each');
    for (const p of c.received) {
      assert.deepEqual(Object.keys(p).sort(), [...TELEMETRY_FIELDS].sort(), 'every delivered payload is whitelist-only');
      assert.equal(typeof p.installId, 'string');
      assert.ok(p.installId.length > 0, 'anonymous install id present');
    }
    // all milestones share ONE anonymous install id
    assert.equal(new Set(c.received.map((p) => p.installId)).size, 1, 'a single anonymous install id across milestones');
  } finally { c.close(); }
});

test('CLI end-to-end (default OFF): init/verify/done deliver NOTHING and exit normally', async () => {
  const c = await collector();
  try {
    const d = mkdtempSync(join(tmpdir(), 'telemetry-off-'));
    const env = { ...process.env, CI: '', CHALK_TELEMETRY: '', CHALK_TELEMETRY_ENDPOINT: c.url };
    const init = await runAsync(d, env, 'init', '--name', 't', '--verify-test', 'node -e "process.exit(0)"'); // no --telemetry
    assert.equal(init.code, 0);
    assert.equal(chalkjson(d).protocol.telemetry.enabled, false, 'default config is OFF');
    const { verify, done } = await toDone(d, env);
    assert.equal(verify.code, 0);
    assert.equal(done.code, 0);
    assert.equal(c.received.length, 0, 'OFF ⇒ no milestones leave the machine');
    assert.equal(existsSync(join(d, '.chalk', 'local', 'telemetry.json')), false, 'OFF ⇒ no install-id written');
  } finally { c.close(); }
});

test('CLI end-to-end: an UNREACHABLE endpoint never changes an exit code (fire-and-forget)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'telemetry-unreach-'));
  const env = { ...process.env, CI: '', CHALK_TELEMETRY: '', CHALK_TELEMETRY_ENDPOINT: 'http://127.0.0.1:1/e' }; // connection refused
  const init = await runAsync(d, env, 'init', '--name', 't', '--telemetry', '--verify-test', 'node -e "process.exit(0)"');
  assert.equal(init.code, 0, 'init still exits 0 with an unreachable telemetry endpoint');
  const { verify, done } = await toDone(d, env);
  assert.equal(verify.code, 0, 'verify still exits 0');
  assert.equal(done.code, 0, 'done still exits 0');
  // a failed delivery is NOT recorded as sent, so it would be retried next run (not silently lost)
  const st = JSON.parse(readFileSync(join(d, '.chalk', 'local', 'telemetry.json'), 'utf8'));
  assert.ok(!st.sent || !st.sent.done, 'an undelivered milestone is not marked sent');
});
