// `chalk discover` end-to-end — the front door: a brief becomes specd chalk tasks with acceptance
// criteria, milestones, and resolved dependencies; dedups against the backlog; --dry-run previews.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const tasks = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json')));

// A stub discovery agent (written to a file to avoid nested-quote shell hell) that emits a proposal.
function project(proposal) {
  const d = mkdtempSync(join(tmpdir(), 'discover-cli-'));
  chalk(d, 'init', '--name', 'd');
  const agent = join(d, 'agent.mjs');
  writeFileSync(agent, `process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(proposal))}));`);
  const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f));
  o.protocol.discovery = { command: `node ${agent}` };
  writeFileSync(f, JSON.stringify(o, null, 2));
  return d;
}

const PROPOSAL = {
  spec: 'A habit tracker.',
  tasks: [
    { title: 'Add a habit', criteria: ['name is required', 'persists across restart'], milestone: 'core' },
    { title: 'Habit reminders', criteria: ['pick a time'], milestone: 'core', after: ['Add a habit'] },
  ],
};

test('chalk discover — creates specd tasks with criteria + milestone, and resolves after-deps', () => {
  const d = project(PROPOSAL);
  const r = chalk(d, 'discover', 'Build a habit tracker');
  assert.equal(r.status, 0);
  const ts = tasks(d);
  assert.equal(ts.length, 2);
  const add = ts.find((t) => t.title === 'Add a habit');
  const rem = ts.find((t) => t.title === 'Habit reminders');
  assert.equal(add.state, 'specd');
  assert.deepEqual(add.acceptanceCriteria.map((c) => c.text), ['name is required', 'persists across restart']);
  assert.equal(add.milestone, 'core');
  assert.deepEqual(rem.after, [add.id], 'after-title resolved to the dependency id');
});

test('chalk discover — dedupes against an existing backlog task', () => {
  const d = project(PROPOSAL);
  chalk(d, 'task', 'add', 'Add a habit'); // a similar task already exists
  const r = chalk(d, 'discover', 'Build a habit tracker');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /skip \(similar exists\)/);
  assert.equal(tasks(d).filter((t) => t.title === 'Add a habit').length, 1, 'no duplicate created');
});

test('chalk discover — --dry-run proposes without creating', () => {
  const d = project(PROPOSAL);
  const r = chalk(d, 'discover', '--input', 'Build a habit tracker', '--dry-run');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /would add/);
  assert.equal(tasks(d).length, 0, 'nothing created in dry-run');
});

test('chalk discover — no brief errors with usage', () => {
  const d = project(PROPOSAL);
  const r = chalk(d, 'discover');
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /usage: chalk discover/);
});
