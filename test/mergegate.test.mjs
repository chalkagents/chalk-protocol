import { captureApproval } from '../lib/approval-inputs.mjs';
// The merge gate — the teeth of the PR discipline. A change may only merge when (a) nothing broke
// (remote CI or local verify), (b) the PR carries a "what was done" recording, and (c) if review is
// required, the adversary passed AND an LGTM is on the PR. mergeBlockers is the pure decision the
// `chalk merge` command enforces; these cover each blocking reason and the all-clear path.
import { test } from 'node:test';
import assert from 'node:assert';
import { mergeBlockers } from '../lib/mergegate.mjs';
import { ciStatus } from '../lib/brokecheck.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'merge-approval-'));
const store = { root, protocol: () => ({}), meta: () => ({}), spec: () => '', tasks: () => [] };
const base = { id: 'task-fixture', title: 'fixture', acceptanceCriteria: [], tests: [] };
const OK = { ok: true, source: 'local', detail: '', approval: captureApproval(store, 'verification', base) };
const recorded = (over = {}) => ({ ...base, pr: { number: 7, recorded: true, lgtm: true }, reviews: [{ verdict: 'pass', approval: captureApproval(store, 'review', base) }], ...over });

test('mergeBlockers — all clear when broke-ok, recorded, and a passing+LGTM review', () => {
  assert.deepEqual(mergeBlockers(store, recorded(), { reviewRequired: true, broke: OK }), []);
});

test('mergeBlockers — blocks on a failed broke-check', () => {
  const b = mergeBlockers(store, recorded(), { reviewRequired: true, broke: { ok: false, source: 'ci', detail: 'remote CI checks are not green' } });
  assert.equal(b.length, 1);
  assert.match(b[0], /broke-check/);
  assert.match(b[0], /CI/);
});

test('mergeBlockers — blocks when the PR has no recording', () => {
  const b = mergeBlockers(store, recorded({ pr: { number: 7, lgtm: true } }), { reviewRequired: true, broke: OK });
  assert.equal(b.length, 1);
  assert.match(b[0], /recording/);
});

test('mergeBlockers — when review required: a passing review is the gate; LGTM is not a hard block', () => {
  // no passing review → blocked
  let b = mergeBlockers(store, recorded({ reviews: [{ verdict: 'block' }] }), { reviewRequired: true, broke: OK });
  assert.ok(b.some((x) => /passing.*review|review.*required|P5/.test(x)));
  // passing review but no LGTM surfaced (e.g. a flaky gh comment) → NOT blocked; merge posts it best-effort
  b = mergeBlockers(store, recorded({ pr: { number: 7, recorded: true } }), { reviewRequired: true, broke: OK });
  assert.deepEqual(b, [], 'a passing review merges even if the LGTM comment did not post');
});

test('ciStatus — a non-checks JSON payload (no string bucket) is treated as none, not a spurious fail', () => {
  const d = mkdtempSync(join(tmpdir(), 'mergegate-'));
  const p = join(d, 'gh.mjs');
  // a stub/garbage gh that returns issue-shaped objects (no `bucket`) for `pr checks`
  writeFileSync(p, `const a=process.argv.slice(2); if(a.includes('checks')) console.log(JSON.stringify([{number:7,title:'x'}]));`);
  const store = { root: d, protocol: () => ({ github: { command: `node ${p}` } }) };
  assert.equal(ciStatus(store, { id: 't', pr: { number: 7 } }), 'none', 'garbage payload → none → falls back to local verify');
});

test('mergeBlockers — review NOT required: LGTM/review are not demanded (only broke + recording)', () => {
  // a recorded change with no reviews at all is fine when review isn't required
  assert.deepEqual(mergeBlockers(store, { ...base, pr: { number: 7, recorded: true }, reviews: [] }, { reviewRequired: false, broke: OK }), []);
  // but broke-check and recording still apply
  const b = mergeBlockers(store, { pr: { number: 7, recorded: false }, reviews: [] }, { reviewRequired: false, broke: { ok: false, source: 'local', detail: 'local verify is not green' } });
  assert.equal(b.length, 2, 'both broke-check and recording block');
});
