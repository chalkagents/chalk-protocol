// C3 (#211) — raised forks pause the task and route to the director, and the answer feeds back. chalk
// raise (#209) records a fork; this makes it MATTER: `chalk work` refuses to proceed while a raise is
// open (a guessed choice never ships), `chalk pending` surfaces it, and answering it records a directive
// (#199 channel — so the next work rebuilds to it), compounds it (#201/#202), and unblocks the task.
// Locked for task-5d2e2fbc.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const taskOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const dirRec = (d) => { const f = join(d, '.chalk/director.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

// A project with a no-op executor and one in-progress task that ALREADY carries an open raise
// (as if the agent had run `chalk raise` mid-work).
function repo(extra = {}) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-route-'));
  chalk(d, 'init', '--name', 'demo');
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.executor = { command: 'node -e "0"' }; o.protocol.requireTest = false;
  writeFileSync(cf, JSON.stringify(o, null, 2));
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: caching', state: 'in-progress', acceptanceCriteria: [{ text: 'works' }], tests: [],
    raised: [{ id: 'raise-abc123', fork: 'which cache eviction policy?', options: ['LRU', 'TTL'], at: 'x', by: 'agent', status: 'open' }],
    ...extra,
  }]));
  return d;
}

test('chalk work — REFUSES to proceed while a fork is raised (a guess never ships)', () => {
  const r = chalk(repo(), 'work', 'task-9f3a2b1c');
  assert.notEqual(r.code, 0, 'work exits non-zero on an open raise');
  assert.match(r.out, /raised for the director|chalk pending/i, 'points the human at chalk pending');
});

test('chalk pending — surfaces the raised fork with its options', () => {
  const out = chalk(repo(), 'pending').out;
  assert.match(out, /Raised forks/i);
  assert.match(out, /which cache eviction policy\?/);
  assert.match(out, /LRU \| TTL/, 'shows the options');
  assert.match(out, /raise-abc1/, 'shows the answer ref');
});

test('chalk pending answer — records a directive (feeds back), compounds, and unblocks the task', () => {
  const d = repo({ state: 'blocked', blockedFrom: 'in-progress', block: { needs: 'decision', reason: 'raised fork', at: 'x' } });
  const r = chalk(d, 'pending', 'answer', 'raise-abc123', 'use an LRU with a 1000-entry cap');
  assert.equal(r.code, 0, r.out);
  const t = taskOf(d);
  assert.equal(t.raised[0].status, 'answered', 'the raise is answered');
  assert.equal(t.raised[0].answer, 'use an LRU with a 1000-entry cap');
  // feeds back into the work as a directive (#199 channel)
  const dir = (t.directives || []).find((x) => x.fromRaise === 'raise-abc123');
  assert.ok(dir, 'the answer becomes a directive the next chalk work rebuilds to');
  assert.equal(dir.instead, 'use an LRU with a 1000-entry cap');
  // compounds as durable taste (#201/#202)
  assert.ok(dirRec(d).some((x) => x.verdict === 'answered' && /LRU/.test(x.instruction)), 'the answer is recorded to the durable director record');
  // and the task is unblocked so work can resume
  assert.equal(t.state, 'in-progress', 'answering unblocks the task parked on the raise');
  assert.ok(!t.block, 'the block is cleared');
});

test('chalk work — proceeds once the raise is answered (no open raises left)', () => {
  const d = repo();
  chalk(d, 'pending', 'answer', 'raise-abc123', 'LRU');
  const r = chalk(d, 'work', 'task-9f3a2b1c');
  assert.doesNotMatch(r.out, /raised for the director/i, 'no longer blocked on the (now answered) raise');
});

test('driver end-to-end — an executor that raises blocks the task needs:decision; answering unblocks it', () => {
  const d = mkdtempSync(join(tmpdir(), 'chalk-route-e2e-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d, stdio: 'pipe' });
  chalk(d, 'init', '--name', 'demo');
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  // the executor itself RAISES a fork mid-work (against the current in-progress task)
  o.protocol.executor = { command: `node ${CLI} raise "which eviction policy?" --options "LRU|TTL"` };
  o.protocol.requireTest = false; o.protocol.worktree = { enabled: false, dir: '..', setup: '' };
  writeFileSync(cf, JSON.stringify(o, null, 2));
  chalk(d, 'task', 'add', 'feat: caching');
  const id = JSON.parse(readFileSync(join(d, '.chalk/tasks.json')))[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'works');

  chalk(d, 'run', '--max', '1', '--until', 'blocked');
  let t = taskOf(d);
  assert.equal(t.state, 'blocked', 'the driver parked the task on the raised fork');
  assert.equal(t.block.needs, 'decision', 'and blocked it as needs:decision — NOT the default human-input');
  const raise = (t.raised || []).find((r) => r.status === 'open');
  assert.ok(raise, 'the executor actually raised a fork');

  const r = chalk(d, 'pending', 'answer', raise.id, 'use an LRU with a size cap');
  assert.equal(r.code, 0, r.out);
  t = taskOf(d);
  assert.notEqual(t.state, 'blocked', 'answering the raise unblocks the DRIVER-blocked task (needs:decision matched)');
  assert.ok((t.directives || []).some((x) => x.fromRaise === raise.id), 'the answer fed back as a directive');
});
