// configDrift — the CONFIG.md drift gate, now nested. The old gate compared only
// Object.keys(meta.protocol), so nested keys (verify.test, review.requiredAt, github.mergeMethod,
// handoff.maxAttempts, …) could drift from the docs — or be added to initSpine — without the gate
// noticing. The contract: each documented section carries a `{ a, b, c }` key list naming EXACTLY
// the nested keys initSpine writes, both directions enforced. Locked contract for task-11b3c04 (#89).
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDrift } from '../lib/config.mjs';
import { initSpine } from '../lib/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROTOCOL = { phase: 'discovery', verify: { test: '', lint: '' }, handoff: { command: '', maxAttempts: 3 } };
const DOC = [
  '### `phase`', 'Current phase.',
  '### `verify`', 'The gates, `{ test, lint }` — command strings.',
  '### `handoff`', '`{ command, maxAttempts }` — the handoff doc knobs.',
].join('\n\n');

test('configDrift — matching docs and config produce zero problems', () => {
  assert.deepEqual(configDrift(PROTOCOL, DOC), []);
});

test('configDrift — an undocumented NEW nested key fails the gate', () => {
  const p = { ...PROTOCOL, verify: { ...PROTOCOL.verify, build: '' } }; // initSpine grew verify.build; the doc did not
  const problems = configDrift(p, DOC);
  assert.equal(problems.length, 1, `exactly the new key is flagged: ${problems}`);
  assert.match(problems[0], /protocol\.verify\.build/, 'the problem names the undocumented dotted path');
});

test('configDrift — a documented-but-REMOVED nested key fails the gate', () => {
  const p = { ...PROTOCOL, handoff: { command: '' } }; // initSpine dropped handoff.maxAttempts; the doc still lists it
  const problems = configDrift(p, DOC);
  assert.equal(problems.length, 1, `exactly the stale key is flagged: ${problems}`);
  assert.match(problems[0], /protocol\.handoff\.maxAttempts/, 'the problem names the stale dotted path');
});

test('configDrift — a value degrading to a scalar or empty object flags EVERY still-documented key', () => {
  // The all-keys-removed edge: the doc still lists { command, maxAttempts } but the default lost
  // its keys entirely — the gate must not silently skip the section.
  for (const degraded of ['', {}]) {
    const problems = configDrift({ ...PROTOCOL, handoff: degraded }, DOC);
    assert.equal(problems.length, 2, `both documented keys are flagged stale (handoff = ${JSON.stringify(degraded)}): ${problems}`);
    assert.match(problems.join('\n'), /protocol\.handoff\.command/);
    assert.match(problems.join('\n'), /protocol\.handoff\.maxAttempts/);
  }
});

test('configDrift — top-level drift is still caught in both directions', () => {
  assert.match(configDrift({ ...PROTOCOL, portal: { dir: '.project' } }, DOC).join('\n'), /missing a section for protocol\.portal/);
  assert.match(configDrift({ verify: PROTOCOL.verify, handoff: PROTOCOL.handoff }, DOC).join('\n'), /documents protocol\.phase, which initSpine no longer writes/);
});

test('configDrift — an object section with nested keys but NO `{ … }` key list fails the gate', () => {
  const doc = DOC.replace('`{ command, maxAttempts }` — the handoff doc knobs.', 'The handoff doc knobs.');
  assert.match(configDrift(PROTOCOL, doc).join('\n'), /protocol\.handoff needs a `\{ … \}` key list/);
});

test('configDrift — deeper levels are data, not schema (github.labelType map entries are not flagged)', () => {
  const p = { github: { command: 'gh', labelType: { bug: 'fix', enhancement: 'feat' } } };
  const doc = '### `github`\n\nThe pipeline, `{ command, labelType }` — labelType maps labels to types.';
  assert.deepEqual(configDrift(p, doc), [], 'recursion stops one level deep');
});

test('the REAL docs/CONFIG.md matches the REAL initSpine defaults, nested keys included', () => {
  const meta = initSpine(mkdtempSync(join(tmpdir(), 'cfgdrift-')), {});
  const md = readFileSync(join(ROOT, 'docs', 'CONFIG.md'), 'utf8');
  assert.deepEqual(configDrift(meta.protocol, md), [], 'docs/CONFIG.md has drifted from initSpine');
  // The gate is only as good as its reach: the defaults must actually contain nested keys.
  assert.ok(Object.keys(meta.protocol.verify).length >= 4, 'verify still carries its nested gates');
});
