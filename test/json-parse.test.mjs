// C1 — robust JSON recovery from BYO-agent stdout. Agents (reviewer, retro, feedback, discovery) wrap their
// JSON in reasoning/prose. A greedy /\{[\s\S]*\}/ match spans from the FIRST stray brace to the LAST, so a
// note like "the guard { } is off" before the verdict makes the whole span unparseable — this actually
// blocked a real adversarial review twice. The fix scans for BALANCED top-level {...} objects (ignoring
// braces inside strings) and recovers the last valid one. Locked contract.
import { test } from 'node:test';
import assert from 'node:assert';
import { jsonObjects, parseLastJson } from '../lib/json.mjs';
import { parseVerdict } from '../lib/review.mjs';

test('jsonObjects — extracts balanced top-level objects, ignoring braces inside strings', () => {
  assert.deepEqual(jsonObjects('no json here'), []);
  assert.deepEqual(jsonObjects('a {"x":1} b {"y":2} c'), ['{"x":1}', '{"y":2}']);
  assert.deepEqual(jsonObjects('{"note":"has a } brace"}'), ['{"note":"has a } brace"}'], 'a brace inside a string is not a delimiter');
  assert.deepEqual(jsonObjects('{"a":{"b":2}}'), ['{"a":{"b":2}}'], 'nested braces stay in one object');
  assert.deepEqual(jsonObjects('a stray } then {"ok":1}'), ['{"ok":1}'], 'a leading stray close-brace does not corrupt the scan');
});

test('parseLastJson — returns the LAST object satisfying the predicate (agents emit the operative JSON last)', () => {
  assert.deepEqual(parseLastJson('{"v":1} {"v":2}'), { v: 2 });
  assert.deepEqual(parseLastJson('{"k":1} {"other":2}', (o) => 'k' in o), { k: 1 }, 'the predicate skips non-matching objects');
  assert.equal(parseLastJson('no json'), null);
});

test('parseVerdict — recovers the verdict amid prose and stray braces (the transient failure we hit)', () => {
  assert.deepEqual(parseVerdict('{"verdict":"pass","findings":[]}'), { verdict: 'pass', findings: [] });
  // Reasoning with stray braces BEFORE the JSON — the greedy span used to grab this and fail to parse.
  const raw = 'Analysis: the code path { early return } looks off.\nMy verdict:\n{"verdict":"block","findings":[{"severity":"high","area":"correctness","note":"the guard { } is wrong"}]}';
  const v = parseVerdict(raw);
  assert.equal(v.verdict, 'block', 'recovers the verdict despite prose braces');
  assert.equal(v.findings.length, 1, 'and its findings (braces inside the note string are preserved)');
  // A scratch object then the verdict object → pick the verdict, not the first brace-group.
  assert.deepEqual(parseVerdict('{"scratch":true}\n{"verdict":"pass","findings":[]}'), { verdict: 'pass', findings: [] });
  assert.equal(parseVerdict('totally not json'), null, 'no JSON → null');
  assert.equal(parseVerdict('{"verdict":"maybe"}'), null, 'an invalid verdict value → null');
});
