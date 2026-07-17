// C1 (#209) — the mid-flight raise primitive. All decision surfacing today is post-hoc (the reviewer
// digests a finished diff, #192). This lets the agent work OUT LOUD: when it hits a fork that needs the
// director's taste it runs `chalk raise "<fork>"` instead of silently guessing. C1 records the raise on
// the task and surfaces it; #210 tells the agent to use it, #211 pauses the task + routes it to the
// director and feeds the answer back. Locked for task-d3cfdb8f.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRaises } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

function repo(state = 'in-progress') {
  const d = mkdtempSync(join(tmpdir(), 'chalk-raise-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', state, acceptanceCriteria: [{ text: 'works' }], tests: [],
  }]));
  return d;
}

test('openRaises — returns only OPEN raises', () => {
  const t = { raised: [{ status: 'open' }, { status: 'answered' }, { status: 'open' }] };
  assert.equal(openRaises(t).length, 2);
  assert.equal(openRaises({}).length, 0, 'no raised array → none');
});

test('chalk raise — records a fork on the current in-progress task with options/why/provenance', () => {
  const d = repo();
  const r = chalk(d, 'raise', 'which cache eviction policy?', '--options', 'LRU|TTL|none', '--why', 'not specified in the ticket');
  assert.equal(r.code, 0, r.out);
  const raised = tasksOf(d)[0].raised;
  assert.equal(raised.length, 1, 'the raise is recorded on the task');
  assert.equal(raised[0].fork, 'which cache eviction policy?');
  assert.deepEqual(raised[0].options, ['LRU', 'TTL', 'none'], 'options are parsed from the pipe list');
  assert.equal(raised[0].why, 'not specified in the ticket');
  assert.equal(raised[0].status, 'open', 'a fresh raise is open — awaiting the director');
  assert.equal(raised[0].by, 'agent', 'raises come from the agent by default');
  assert.ok(raised[0].id && raised[0].at, 'has an id + timestamp');
});

test('chalk raise --task — targets a specific task; refuses when there is no target', () => {
  const d = repo('specd'); // nothing in-progress
  assert.notEqual(chalk(d, 'raise', 'a fork').code, 0, 'no in-progress task and no --task → refuse');
  assert.equal(chalk(d, 'raise', 'a fork', '--task', 'task-9f3a2b1c').code, 0, '--task targets it explicitly');
  assert.equal(tasksOf(d)[0].raised.length, 1);
});

test('chalk raise (no fork) — lists the open raised forks awaiting the director', () => {
  const d = repo();
  chalk(d, 'raise', 'eviction policy?', '--options', 'LRU|TTL');
  const out = chalk(d, 'raise').out;
  assert.match(out, /Raised forks/i, 'lists them');
  assert.match(out, /eviction policy\?/);
  assert.match(out, /LRU \| TTL/, 'shows the options');
});
