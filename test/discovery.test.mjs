// Discovery / intake — the front door of the lifecycle. A product brief is handed to a BYO agent
// that proposes a scoped backlog: tasks, each with acceptance criteria. These cover the agent
// run/parse (mirroring runRetro) and the normalization that keeps only well-formed, deduped tasks.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDiscovery, normalizeProposal } from '../lib/discovery.mjs';

const store = (root, discovery) => ({ root, protocol: () => ({ discovery }) });

test('normalizeProposal — keeps only tasks with a title AND a real criterion; trims; dedupes by title', () => {
  const tasks = normalizeProposal({
    tasks: [
      { title: '  Add habit sorting  ', criteria: ['sorts by streak desc', '  '], milestone: ' core ' },
      { title: 'No criteria here', criteria: [] },          // dropped: no criterion
      { title: '', criteria: ['x'] },                        // dropped: no title
      { title: 'Add habit sorting', criteria: ['dup title'] }, // dropped: duplicate title
      { title: 'Reminders', criteria: ['  pick a time  '], after: ['Add habit sorting'] },
    ],
  });
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], { title: 'Add habit sorting', criteria: ['sorts by streak desc'], milestone: 'core', after: [] });
  assert.deepEqual(tasks[1], { title: 'Reminders', criteria: ['pick a time'], milestone: undefined, after: ['Add habit sorting'] });
});

test('normalizeProposal — tolerates junk shapes', () => {
  assert.deepEqual(normalizeProposal(null), []);
  assert.deepEqual(normalizeProposal({}), []);
  assert.deepEqual(normalizeProposal({ tasks: 'nope' }), []);
});

test('runDiscovery — runs the BYO agent and parses { tasks, spec } tolerantly', () => {
  const d = mkdtempSync(join(tmpdir(), 'discovery-'));
  const proposal = { spec: 'A habit tracker.', tasks: [{ title: 'Add habit', criteria: ['name + save'] }] };
  // write the stub agent to a file to avoid nested-quote shell hell (it emits prose then the JSON)
  const p = join(d, 'agent.mjs');
  writeFileSync(p, `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log('plan...\\n'+${JSON.stringify(JSON.stringify(proposal))}));`);
  const r = runDiscovery(store(d, { command: `node ${p}` }), 'Build a habit tracker');
  assert.equal(r.status, 'ok');
  assert.equal(r.spec, 'A habit tracker.');
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'Add habit');
});

test('runDiscovery — unconfigured / non-JSON', () => {
  const d = mkdtempSync(join(tmpdir(), 'discovery-'));
  assert.equal(runDiscovery(store(d, { command: '' }), 'x').status, 'unconfigured');
  assert.equal(runDiscovery(store(d, { command: 'node -e "console.log(\\"nope\\")"' }), 'x').status, 'error');
});
