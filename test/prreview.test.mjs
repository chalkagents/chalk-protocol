// Remote-PR review surfacing — the reviewer's verdict must show up ON the GitHub PR (findings on
// block, an explicit LGTM on pass), not just in the local spine, so a human reviewing the PR sees it
// and the merge gate has a signal. Covers the comment render, the gh posting (via a stub), the
// no-PR/no-gh no-ops, and that a gh failure is swallowed rather than crashing the review.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postReviewToPr, reviewComment } from '../lib/prreview.mjs';

test('reviewComment — LGTM on pass; findings list on block', () => {
  const pass = reviewComment({ verdict: 'pass', findings: [] });
  assert.match(pass, /LGTM/, 'pass carries an LGTM marker');

  const block = reviewComment({ verdict: 'block', findings: [
    { severity: 'high', area: 'correctness', note: 'off-by-one in the loop' },
    { severity: 'med', area: 'test-adequacy', note: 'no test for the empty case' },
  ] });
  assert.doesNotMatch(block, /LGTM/);
  assert.match(block, /off-by-one in the loop/);
  assert.match(block, /test-adequacy/);
  assert.match(block, /no test for the empty case/);
});

// A stub `gh` that appends the comment body (read from stdin via --body-file -) to a file.
function stubGh(d, outFile) {
  const p = join(d, 'gh.mjs');
  writeFileSync(p, `import {appendFileSync} from 'node:fs'; let s='';
    process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>appendFileSync(${JSON.stringify(outFile)}, s+'\\n----\\n'));`);
  return `node ${p}`;
}
const mkStore = (root, ghCmd) => ({ root, protocol: () => ({ github: { command: ghCmd } }) });

test('postReviewToPr — posts an LGTM comment to the PR on pass (via gh --body-file -)', () => {
  const d = mkdtempSync(join(tmpdir(), 'prreview-'));
  const out = join(d, 'comment.txt');
  const store = mkStore(d, stubGh(d, out));
  const task = { id: 't', pr: { number: 7 } };

  const r = postReviewToPr(store, task, { verdict: 'pass', findings: [] });
  assert.equal(r.posted, true);
  assert.equal(r.lgtm, true, 'pass → lgtm signal');
  assert.match(readFileSync(out, 'utf8'), /LGTM/, 'the LGTM comment reached gh stdin');
});

test('postReviewToPr — posts findings on block (lgtm false)', () => {
  const d = mkdtempSync(join(tmpdir(), 'prreview-'));
  const out = join(d, 'comment.txt');
  const r = postReviewToPr(mkStore(d, stubGh(d, out)), { id: 't', pr: { number: 7 } },
    { verdict: 'block', findings: [{ severity: 'high', area: 'correctness', note: 'wrong' }] });
  assert.equal(r.posted, true);
  assert.equal(r.lgtm, false);
  assert.match(readFileSync(out, 'utf8'), /wrong/);
});

test('postReviewToPr — no-op without a PR or without gh; never throws on a gh failure', () => {
  const d = mkdtempSync(join(tmpdir(), 'prreview-'));
  // no PR on the task
  assert.deepEqual(postReviewToPr(mkStore(d, 'gh'), { id: 't' }, { verdict: 'pass' }), { posted: false, lgtm: false, reason: 'no PR' });
  // no gh configured
  assert.equal(postReviewToPr(mkStore(d, ''), { id: 't', pr: { number: 7 } }, { verdict: 'pass' }).posted, false);
  // a failing gh is swallowed → {posted:false}, no throw
  const bad = postReviewToPr(mkStore(d, 'node -e "process.exit(1)"'), { id: 't', pr: { number: 7 } }, { verdict: 'pass' });
  assert.equal(bad.posted, false);
});
