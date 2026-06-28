// PR body recording — the "what was done" a human (and the merge gate) reads on the PR. Today's body
// is just the acceptance criteria; this makes it a real record: summary, what changed, the changed
// files, criteria, and a test plan, with an optional BYO narrative. hasRecording is the merge-gate
// hook. These cover the render, the no-narrative fallback, the BYO narrative, and the recorded flag.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { buildPrBody, prNarrative, hasRecording } from '../lib/prbody.mjs';

const mkStore = (root, prbody) => ({ root, protocol: () => ({ prbody }) });
const mkTask = (over = {}) => ({
  id: 'task-abcdef0', title: 'feat: add the sort', state: 'in-progress', issue: { number: 11 },
  acceptanceCriteria: [{ text: 'streak-descending' }, { text: 'stable tie-break' }],
  tests: [{ path: 'test/sort.test.js' }], ...over,
});

test('buildPrBody — renders every section, the changed files, and a Closes footer', () => {
  const body = buildPrBody(mkStore('/x'), mkTask(), {
    changed: ['lib/sort.js', 'test/sort.test.js'], narrative: 'Sorted habits by streak with a stable tie-break.',
  });
  assert.match(body, /## Summary/);
  assert.match(body, /## What was done/);
  assert.match(body, /Sorted habits by streak/, 'the narrative is used');
  assert.match(body, /## Changes/);
  assert.match(body, /lib\/sort\.js/, 'changed files are listed');
  assert.match(body, /## Acceptance criteria/);
  assert.match(body, /streak-descending[\s\S]*stable tie-break/);
  assert.match(body, /## Test plan/);
  assert.match(body, /Closes #11/, 'issue footer');
});

test('buildPrBody — no narrative → a structured default line, never an empty section', () => {
  const body = buildPrBody(mkStore('/x'), mkTask(), { changed: ['lib/sort.js'] });
  const what = body.split('## What was done')[1].split('##')[0].trim();
  assert.ok(what.length > 0, 'the What-was-done section is non-empty without a narrative');
  // and an issueless task omits the Closes footer
  assert.doesNotMatch(buildPrBody(mkStore('/x'), mkTask({ issue: undefined }), { changed: ['a'] }), /Closes #/);
});

test('prNarrative — a BYO command authors the narrative; absent → empty (no model call)', () => {
  const d = mkdtempSync(join(tmpdir(), 'prbody-')); // a real cwd: prNarrative runs the command there
  assert.equal(prNarrative(mkStore(d), mkTask(), ['lib/sort.js']), '', 'no command → empty');
  const cmd = `node -e "process.stdin.on('data',()=>{});console.log('PR-NARRATIVE: stable sort by streak')"`;
  const out = prNarrative(mkStore(d, { command: cmd }), mkTask(), ['lib/sort.js']);
  assert.match(out, /PR-NARRATIVE: stable sort by streak/);
  // a failing BYO command falls back to '' (buildPrBody then uses the structured default), never throws
  assert.equal(prNarrative(mkStore(d, { command: 'node -e "process.exit(1)"' }), mkTask(), ['a']), '');
});

test('hasRecording — true only when task.pr.recorded is set', () => {
  assert.equal(hasRecording({ pr: { recorded: true } }), true);
  assert.equal(hasRecording({ pr: { recorded: false } }), false);
  assert.equal(hasRecording({ pr: {} }), false);
  assert.equal(hasRecording({}), false);
});
