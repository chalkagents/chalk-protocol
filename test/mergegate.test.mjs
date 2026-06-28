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

const OK = { ok: true, source: 'local', detail: '' };
const recorded = (over = {}) => ({ pr: { number: 7, recorded: true, lgtm: true }, reviews: [{ verdict: 'pass' }], ...over });

test('mergeBlockers — all clear when broke-ok, recorded, and a passing+LGTM review', () => {
  assert.deepEqual(mergeBlockers({}, recorded(), { reviewRequired: true, broke: OK }), []);
});

test('mergeBlockers — blocks on a failed broke-check', () => {
  const b = mergeBlockers({}, recorded(), { reviewRequired: true, broke: { ok: false, source: 'ci', detail: 'remote CI checks are not green' } });
  assert.equal(b.length, 1);
  assert.match(b[0], /broke-check/);
  assert.match(b[0], /CI/);
});

test('mergeBlockers — blocks when the PR has no recording', () => {
  const b = mergeBlockers({}, recorded({ pr: { number: 7, lgtm: true } }), { reviewRequired: true, broke: OK });
  assert.equal(b.length, 1);
  assert.match(b[0], /recording/);
});

test('mergeBlockers — when review required: needs a passing review AND an LGTM', () => {
  // no passing review
  let b = mergeBlockers({}, recorded({ reviews: [{ verdict: 'block' }] }), { reviewRequired: true, broke: OK });
  assert.ok(b.some((x) => /passing.*review|review.*required|P5/.test(x)));
  // passing review but no LGTM surfaced
  b = mergeBlockers({}, recorded({ pr: { number: 7, recorded: true } }), { reviewRequired: true, broke: OK });
  assert.ok(b.some((x) => /LGTM/.test(x)));
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
  assert.deepEqual(mergeBlockers({}, { pr: { number: 7, recorded: true }, reviews: [] }, { reviewRequired: false, broke: OK }), []);
  // but broke-check and recording still apply
  const b = mergeBlockers({}, { pr: { number: 7, recorded: false }, reviews: [] }, { reviewRequired: false, broke: { ok: false, source: 'local', detail: 'local verify is not green' } });
  assert.equal(b.length, 2, 'both broke-check and recording block');
});
