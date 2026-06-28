// Broke-check — "did something break" before merge. Source of truth is the PR's remote CI when it
// has any (gh pr checks), else a local verify. These cover the bucket→verdict mapping, the
// nonzero-exit-but-JSON-on-stdout case (failing/pending checks), the no-CI fallbacks, and that
// brokeCheck picks CI over local and only falls back when there are no checks.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ciStatus, brokeCheck } from '../lib/brokecheck.mjs';

// A stub `gh` that prints the given JSON for `pr checks`, optionally exiting nonzero (as real gh does
// when checks fail/pend) while still emitting the JSON on stdout.
function ghChecks(d, json, exit = 0) {
  const p = join(d, `gh-${exit}-${Math.abs(json.length)}.mjs`);
  writeFileSync(p, `const a=process.argv.slice(2);
    if(a.includes('checks')){ console.log(${JSON.stringify(JSON.stringify(json))}); process.exit(${exit}); }`);
  return `node ${p}`;
}
const mkStore = (root, ghCmd) => ({ root, protocol: () => ({ github: { command: ghCmd } }) });
const withPr = { id: 't', pr: { number: 7 } };

test('ciStatus — bucket mapping: all pass/skipping → pass; any fail/pending → fail', () => {
  const d = mkdtempSync(join(tmpdir(), 'brokeck-'));
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [{ bucket: 'pass' }, { bucket: 'skipping' }])), withPr), 'pass');
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [{ bucket: 'pass' }, { bucket: 'fail' }])), withPr), 'fail');
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [{ bucket: 'pending' }])), withPr), 'fail', 'pending is not green');
});

test('ciStatus — none when no PR, no gh, or no checks', () => {
  const d = mkdtempSync(join(tmpdir(), 'brokeck-'));
  assert.equal(ciStatus(mkStore(d, 'gh'), { id: 't' }), 'none', 'no PR');
  assert.equal(ciStatus(mkStore(d, ''), withPr), 'none', 'no gh');
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [])), withPr), 'none', 'empty checks array → no CI');
});

test('ciStatus — tolerates gh exiting nonzero while still printing the JSON', () => {
  const d = mkdtempSync(join(tmpdir(), 'brokeck-'));
  // real gh exits 8 (pending) / 1 (failing) but still prints the checks JSON to stdout
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [{ bucket: 'fail' }], 1)), withPr), 'fail');
  assert.equal(ciStatus(mkStore(d, ghChecks(d, [{ bucket: 'pass' }], 8)), withPr), 'pass');
});

test('brokeCheck — prefers CI; falls back to local verify only when CI is none', () => {
  const d = mkdtempSync(join(tmpdir(), 'brokeck-'));
  let localCalled = 0;
  const verifyFn = (green) => () => { localCalled++; return { green }; };

  // CI present + green → ok via ci, local NOT consulted
  let r = brokeCheck(mkStore(d, ghChecks(d, [{ bucket: 'pass' }])), withPr, { verifyFn: verifyFn(false) });
  assert.deepEqual({ ok: r.ok, source: r.source }, { ok: true, source: 'ci' });
  assert.equal(localCalled, 0, 'local verify skipped when CI decides');

  // CI present + failing → not ok via ci
  r = brokeCheck(mkStore(d, ghChecks(d, [{ bucket: 'fail' }])), withPr, { verifyFn: verifyFn(true) });
  assert.deepEqual({ ok: r.ok, source: r.source }, { ok: false, source: 'ci' });

  // no CI → fall back to local verify
  r = brokeCheck(mkStore(d, 'gh'), { id: 't' }, { verifyFn: verifyFn(true) });
  assert.deepEqual({ ok: r.ok, source: r.source }, { ok: true, source: 'local' });
  assert.equal(localCalled, 1, 'local verify consulted on the fallback path');
  r = brokeCheck(mkStore(d, 'gh'), { id: 't' }, { verifyFn: verifyFn(false) });
  assert.equal(r.ok, false, 'local red → not ok');
});
