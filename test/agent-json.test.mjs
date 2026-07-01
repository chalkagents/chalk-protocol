// C2 — the retro/feedback/discovery agents parse their JSON with the SAME fragile greedy /{...}/ regex that
// broke the reviewer (C1): a stray brace in the agent's reasoning makes the span from the first brace to the
// last unparseable, so a perfectly good {lessons}/{issues}/{tasks} payload is dropped as an 'error'. Each now
// uses the robust balanced-brace parseLastJson. This drives each function with a stub agent that wraps its
// JSON in prose-with-a-stray-brace — which fails against the old regex and succeeds against the fix. Locked.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRetro } from '../lib/retro.mjs';
import { runFeedback } from '../lib/feedback.mjs';
import { runDiscovery } from '../lib/discovery.mjs';

// A tmp dir whose stub agent ignores stdin and prints reasoning (with a STRAY BRACE) then the JSON payload.
function stubDir(obj) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-c2-'));
  const output = 'Reasoning about { the code path } here. My proposal:\n' + JSON.stringify(obj);
  writeFileSync(join(d, 'agent.mjs'),
    `process.stdin.on('data',()=>{});process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(output)}));`);
  return d;
}
const storeFor = (d, key) => ({
  protocol: () => ({ [key]: { command: 'node agent.mjs' }, runner: '' }),
  root: d, updates: () => [], tasks: () => [], lessons: () => [], logCost: () => {},
});

test('runRetro — recovers {lessons,issues} from output wrapped in reasoning/prose', () => {
  const r = runRetro(storeFor(stubDir({ lessons: ['always author a real test'], issues: [] }), 'retro'));
  assert.equal(r.status, 'ok', 'a stray brace in the reasoning must not drop the payload');
  assert.deepEqual(r.lessons, ['always author a real test']);
});

test('runFeedback — recovers {issues} from prose-wrapped output', () => {
  const r = runFeedback(storeFor(stubDir({ issues: [{ title: 'fix the thing' }] }), 'feedback'), 'signals');
  assert.equal(r.status, 'ok');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].title, 'fix the thing');
});

test('runDiscovery — recovers {tasks} from prose-wrapped output', () => {
  const r = runDiscovery(storeFor(stubDir({ tasks: [{ title: 'build Z', criteria: ['does Z'] }] }), 'discovery'), 'brief');
  assert.equal(r.status, 'ok');
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'build Z');
});
