// Document the promote CI-poll knobs (#153). github.ciPollIntervalMs / ciPollAttempts existed in code
// and the initSpine defaults (so the drift gate's KEY list included them) but were never EXPLAINED —
// a user hitting a slow-CI timeout had no idea the wait was tunable. docs/CONFIG.md now describes what
// they control and the `ciPollAttempts: 0` never-wait escape, and the release --promote timeout points
// at them. This pins that documentation so a future edit can't silently drop it. Locked contract for #153.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDrift } from '../lib/config.mjs';
import { initSpine } from '../lib/store.mjs';
import { brokeCheck } from '../lib/brokecheck.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('docs/CONFIG.md DESCRIBES the CI-poll knobs (not merely lists them) + the never-wait escape', () => {
  const md = read('docs/CONFIG.md');
  const gh = md.slice(md.indexOf('### `github`'), md.indexOf('### `worktree`'));
  assert.ok(gh, 'the github config section exists');
  assert.match(gh, /ciPollIntervalMs/, 'names the interval knob');
  assert.match(gh, /ciPollAttempts/, 'names the attempts knob');
  assert.match(gh, /poll/i, 'explains they control polling (a description, not a bare key list)');
  assert.match(gh, /ciPollAttempts: ?0/, 'documents the 0 escape hatch');
  // Accuracy (the review caught a wrong claim): 0 must be described as BLOCKING a pending check, NOT
  // falling back to local verify.
  assert.match(gh, /block/i, 'describes 0 as blocking a still-pending check');
  assert.match(gh, /not fall back to local verify|no checks at all/i, 'clarifies it is NOT a local-verify fallback');
});

test('the described 0-behavior matches brokeCheck: 0 attempts + a pending check BLOCKS (no local-verify fallback)', () => {
  const store = { root: '/tmp', protocol: () => ({ github: { ciPollAttempts: 0, ciPollIntervalMs: 5000 } }) };
  let localVerifyCalled = false;
  const verifyFn = () => { localVerifyCalled = true; return { green: true }; };
  // Pending CI + 0 attempts → blocked on CI, and local verify is NOT consulted (matches the docs).
  const pending = brokeCheck(store, {}, { classify: () => 'pending', verifyFn, sleep: () => {} });
  assert.equal(pending.ok, false, '0 attempts does not wait → a pending check blocks');
  assert.equal(pending.source, 'ci', 'the block comes from CI, not a local-verify fallback');
  assert.equal(localVerifyCalled, false, 'local verify is NOT run for a pending check');
  // Only a PR with NO checks falls back to local verify (independent of the poll knobs).
  const none = brokeCheck(store, {}, { classify: () => 'none', verifyFn, sleep: () => {} });
  assert.equal(none.source, 'local', "'none' (no checks) → local verify");
});

test('the CONFIG.md ↔ initSpine drift gate stays green (the knobs remain documented keys)', () => {
  const d = mkdtempSync(join(tmpdir(), 'cipoll-'));
  const meta = initSpine(d, { name: 'p' });
  assert.deepEqual(configDrift(meta.protocol, read('docs/CONFIG.md')), [], 'no drift between docs and the defaults');
});

test('the release --promote CI-poll timeout points the user at the knobs', () => {
  const src = read('bin/chalk.mjs');
  // The still-pending branch of the promote CI wait must reference the knobs so the timeout is actionable.
  assert.match(src, /still pending[\s\S]{0,120}ciPollAttempts/, 'the pending-timeout message names ciPollAttempts');
});
