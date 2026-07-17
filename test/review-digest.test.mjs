// The decision digest (#192) — the director-harness reframe of the adversarial reviewer. The same
// review pass that emits pass/block ALSO surfaces the judgment calls the implementer resolved silently
// (approach, default, tradeoff, omission), each with a blast-radius + reversibility, so a human can
// accept or redirect them instead of re-reading the whole diff. The digest is additive: an older
// reviewer that emits no `decisions` key stays valid (empty digest, gate unchanged), and the digest is
// shown even on a PASS. Locked contract for task-7b47799.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReviewPrompt, parseVerdict, formatDecisionDigest, DECISION_DIGEST_INSTRUCTION } from '../lib/review.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];

test('buildReviewPrompt — asks for a decisions digest, framed for accept/redirect, even on pass', () => {
  const p = buildReviewPrompt({ project: { description: 'g' } }, { title: 'T', acceptanceCriteria: [{ text: 'x' }], tests: [] }, 'diff');
  assert.match(p, /"decisions":\[\{"choice"/, 'the JSON schema includes the decisions array');
  assert.match(p, /blastRadius/, 'each decision carries a blast-radius');
  assert.match(p, /reversibility/, 'each decision carries a reversibility');
  assert.match(p, /EVEN WHEN YOU PASS/i, 'decisions are requested even on a pass');
  assert.ok(p.includes(DECISION_DIGEST_INSTRUCTION), 'the digest instruction is embedded verbatim');
});

test('parseVerdict — extracts decisions, and stays valid/empty when a reviewer omits them (additive)', () => {
  const withD = parseVerdict('{"verdict":"pass","findings":[],"decisions":[{"choice":"used a flag","rationale":"simplest","blastRadius":"low","reversibility":"easy"}]}');
  assert.equal(withD.verdict, 'pass');
  assert.equal(withD.decisions.length, 1);
  assert.equal(withD.decisions[0].choice, 'used a flag');

  const legacy = parseVerdict('{"verdict":"pass","findings":[]}');
  assert.deepEqual(legacy, { verdict: 'pass', findings: [] }, 'no decisions → the exact old shape (additive, no new key)');
  assert.ok(!(legacy.decisions?.length), 'digest reads empty for a legacy reviewer');

  const bad = parseVerdict('{"verdict":"block","findings":[],"decisions":"nope"}');
  assert.ok(!(bad.decisions?.length), 'a non-array decisions is ignored, not a crash');
});

test('formatDecisionDigest — renders choice + blast-radius + reversibility; empty in → empty out', () => {
  assert.deepEqual(formatDecisionDigest([]), []);
  assert.deepEqual(formatDecisionDigest('nope'), [], 'tolerant of a non-array');
  const lines = formatDecisionDigest([
    { choice: 'chose opt-in default off', rationale: 'no regression', blastRadius: 'low', reversibility: 'easy' },
    { choice: 'named it align', rationale: 'director brand' }, // missing blast/undo → rendered with ?
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /blast:low/);
  assert.match(lines[0], /undo:easy/);
  assert.match(lines[0], /chose opt-in default off/);
  assert.match(lines[0], /no regression/);
  assert.match(lines[1], /blast:\? · undo:\?/, 'missing fields degrade gracefully');
  // a decision with neither choice nor rationale is dropped (not noise)
  assert.deepEqual(formatDecisionDigest([{ blastRadius: 'low' }]), []);
});

// A spine with one in-progress task at pr-open + a stub reviewer command we control.
function repoWithReviewer(d, verdictJson) {
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-aaaaaaaa', title: 'feat: a thing', state: 'in-progress',
    acceptanceCriteria: [{ text: 'works' }], tests: [], reviews: [],
    pipeline: { stage: 'pr-open', at: '2026-01-01T00:00:00Z' }, pr: { number: 7, recorded: true },
  }]));
  writeFileSync(join(d, 'rev.mjs'), `console.log(${JSON.stringify(JSON.stringify(verdictJson))});`);
  const cf = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.review = { ...(o.protocol.review || {}), command: `node ${join(d, 'rev.mjs')}` };
  // give captureDiff a change to see so the reviewer isn't short-circuited on no-diff
  writeFileSync(cf, JSON.stringify(o, null, 2));
  spawnSync('git', ['init', '-b', 'main'], { cwd: d });
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: d });
  writeFileSync(join(d, 'change.txt'), 'a change to review');
  spawnSync('git', ['add', '-A'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-m', 'change'], { cwd: d });
}

test('chalk review — renders the decision digest and records it, even on a PASS verdict', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-digest-'));
  repoWithReviewer(d, { verdict: 'pass', findings: [], decisions: [
    { choice: 'stored acceptance as a flag on the task', rationale: 'mirrors planApproved', blastRadius: 'low', reversibility: 'easy' },
  ] });
  const r = chalk(d, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, `pass exits 0: ${r.out}`);
  assert.match(r.out, /Decision digest/i, 'the digest header renders on a pass');
  assert.match(r.out, /stored acceptance as a flag/, 'the judgment call is surfaced');
  const t = taskOf(d);
  assert.equal(t.reviews.slice(-1)[0].verdict, 'pass');
  assert.equal(t.reviews.slice(-1)[0].decisions.length, 1, 'the digest is recorded on the review');
});

test('chalk review — a reviewer that emits no decisions prints no digest (additive, no regression)', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-digest-none-'));
  repoWithReviewer(d, { verdict: 'pass', findings: [] });
  const r = chalk(d, 'review', 'task-aaaaaaaa');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Decision digest/i, 'no digest section when there are no decisions');
  assert.deepEqual(taskOf(d).reviews.slice(-1)[0].decisions, [], 'recorded as an empty digest');
});
