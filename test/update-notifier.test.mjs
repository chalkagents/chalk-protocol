// Version reporting + opt-out update notifier (#158). `chalk --version`/`-v` report the PACKAGE
// version (they used to error / print only the protocol tag); `chalk version` keeps the bare protocol
// tag for scripts. The update notifier is best-effort and INERT in every non-interactive / opted-out
// context — it must never change a command's exit code or pollute --json, and a registry failure is
// swallowed. Locked contract for #158.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldSkipUpdateCheck, updateNotice, resolveLatest, checkForUpdate } from '../lib/update.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const run = (...args) => { const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

test('--version / -v print the package semver and exit 0; `version` keeps the protocol tag', () => {
  for (const flag of ['--version', '-v']) {
    const r = run(flag);
    assert.equal(r.code, 0, `${flag} exits 0`);
    assert.match(r.out, /\d+\.\d+\.\d+/, `${flag} prints a semver package version`);
  }
  const v = run('version');
  assert.equal(v.code, 0);
  assert.match(v.out, /chalk\/\d/, '`chalk version` still prints the protocol tag');
  assert.doesNotMatch(v.out.trim(), /^\d+\.\d+\.\d+/, '`chalk version` is NOT the semver');
});

test('shouldSkipUpdateCheck skips in every non-interactive / opted-out context', () => {
  assert.equal(shouldSkipUpdateCheck({ isTTY: false }), true, 'non-TTY (pipe/CI/test) → skip');
  assert.equal(shouldSkipUpdateCheck({ isTTY: true, json: true }), true, '--json → skip');
  assert.equal(shouldSkipUpdateCheck({ isTTY: true, env: { CI: '1' } }), true, 'CI → skip');
  assert.equal(shouldSkipUpdateCheck({ isTTY: true, env: { CHALK_NO_UPDATE_CHECK: '1' } }), true, 'opt-out env → skip');
  assert.equal(shouldSkipUpdateCheck({ isTTY: true, updateCheckConfig: false }), true, 'config off → skip');
  assert.equal(shouldSkipUpdateCheck({ isTTY: true, env: {} }), false, 'interactive + no opt-out → run');
});

test('updateNotice only fires for a strictly-newer latest', () => {
  assert.match(updateNotice('0.2.0', '0.3.0'), /update available: 0\.2\.0 → 0\.3\.0/);
  assert.equal(updateNotice('0.3.0', '0.3.0'), null, 'same version → no notice');
  assert.equal(updateNotice('0.4.0', '0.3.0'), null, 'older latest → no notice');
  assert.equal(updateNotice('0.2.0', null), null, 'no data → no notice');
});

test('resolveLatest prefers a fresh cache (no network) and refreshes a stale one', async () => {
  let fetched = 0;
  const fresh = await resolveLatest({ now: 1000, read: () => ({ latest: '9.9.9', at: 1000 }), write: () => {}, fetchLatest: async () => { fetched++; return '0.0.0'; } });
  assert.equal(fresh, '9.9.9', 'a fresh cache is used verbatim');
  assert.equal(fetched, 0, 'no network hit when the cache is fresh');
  let saved = null;
  const refreshed = await resolveLatest({ now: 1_000_000_000, read: () => ({ latest: '1.0.0', at: 0 }), write: (o) => { saved = o; }, fetchLatest: async () => { fetched++; return '2.0.0'; } });
  assert.equal(refreshed, '2.0.0', 'a stale cache is refreshed from the fetcher');
  assert.equal(fetched, 1);
  assert.equal(saved.latest, '2.0.0', 'the fresh result is cached');
});

test('checkForUpdate is skip-first and swallows a registry failure (never throws)', async () => {
  let fetched = 0;
  const skipped = await checkForUpdate({ current: '0.1.0', isTTY: false, now: 1, fetchLatest: async () => { fetched++; return '9.9.9'; }, read: () => null, write: () => {} });
  assert.equal(skipped, null, 'skipped context → no notice');
  assert.equal(fetched, 0, 'skip is decided BEFORE any fetch');
  const failed = await checkForUpdate({ current: '0.1.0', isTTY: true, env: {}, now: 1, read: () => null, write: () => {}, fetchLatest: async () => { throw new Error('offline'); } });
  assert.equal(failed, null, 'a registry failure yields no notice and does not throw');
});

test('checkForUpdate produces the notice on the INTERACTIVE, newer-available path', async () => {
  const notice = await checkForUpdate({ current: '0.1.0', isTTY: true, env: {}, now: 1, read: () => null, write: () => {}, fetchLatest: async () => '0.2.0' });
  assert.match(notice, /update available: 0\.1\.0 → 0\.2\.0/, 'interactive + newer latest → the notice string bin prints');
});

test('chalk upgrade --dry-run prints the global-npm update command and does not run it', () => {
  const r = run('upgrade', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /npm i -g chalk-protocol@latest/, 'the correct upgrade command is shown');
  assert.match(r.out, /dry.?run|would run/i, 'and it is only shown, not executed');
});

test('a --json command stays clean and exits normally — the notifier cannot pollute it', () => {
  const r = run('log', '--json');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /update available/, 'no update notice leaks into --json output');
});
