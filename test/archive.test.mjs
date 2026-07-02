// `chalk archive` — spine compaction without loss. A long-lived project's tasks.json grows
// unbounded (this repo: 134KB in 3 months); archive moves FINISHED history (done AND released
// tasks + their event lines) into .chalk/archive/ while everything still-referenced or
// still-releasable stays live:
//   - done+released → moves; done-unreleased → stays (release idempotency depends on it);
//   - a task referenced by a remaining task's `after` is KEPT with a printed reason (no dangling
//     DAG edges);
//   - only events whose taskId was archived move — global events (decisions, releases) stay;
//   - the portal still shows delivered history (scope reads the archive too);
//   - idempotent: a second run finds nothing; --dry-run writes nothing.
// Locked contract for task-a16e36e.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk', 'tasks.json'), 'utf8'));
const YEAR = new Date().getFullYear(); // NOTE: chalk stamps with its own now(); same calendar year in practice

// A spine with: A done+released, B done+released but dep-referenced by pending D, C done-unreleased,
// E in-progress. Events: two for A, one for B, one global (no taskId).
function seeded() {
  const d = mkdtempSync(join(tmpdir(), 'archive-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  chalk(d, 'init', '--name', 't', '--bare');
  for (const t of ['A ships', 'B ships', 'C ships', 'E wip']) chalk(d, 'task', 'add', t);
  const ts = tasksOf(d);
  const [A, B, C, E] = ts;
  A.state = 'done'; A.released = '0.1.0';
  B.state = 'done'; B.released = '0.1.0';
  C.state = 'done'; // NOT released
  E.state = 'in-progress';
  const D = { ...A, id: 'task-ddddddd', title: 'D depends on B', state: 'specd', released: undefined, after: [B.id], acceptanceCriteria: [{ text: 'x' }], tests: [] };
  delete D.released;
  writeFileSync(join(d, '.chalk', 'tasks.json'), JSON.stringify([A, B, C, E, D], null, 2));
  appendFileSync(join(d, '.chalk', 'updates.jsonl'),
    JSON.stringify({ id: 'evt-1', type: 'progress-update', title: 'a1', taskId: A.id, at: '2026-01-01T00:00:00Z' }) + '\n' +
    JSON.stringify({ id: 'evt-2', type: 'work-item-accepted', title: 'a2', taskId: A.id, at: '2026-01-02T00:00:00Z' }) + '\n' +
    JSON.stringify({ id: 'evt-3', type: 'progress-update', title: 'b1', taskId: B.id, at: '2026-01-03T00:00:00Z' }) + '\n' +
    JSON.stringify({ id: 'evt-4', type: 'decision-logged', title: 'global decision', at: '2026-01-04T00:00:00Z' }) + '\n');
  return { d, A, B, C, E, D };
}

test('archive — moves done+released, keeps dep-referenced/unreleased/live, relocates only their events', () => {
  const { d, A, B, C, E } = seeded();

  const dry = chalk(d, 'archive', '--dry-run');
  assert.equal(dry.code, 0);
  assert.match(dry.out, /would archive: A ships/);
  assert.match(dry.out, /kept B ships/);
  assert.doesNotMatch(dry.out, /would archive: C ships/, 'unreleased done stays releasable');
  assert.equal(tasksOf(d).length, 5, 'dry-run writes nothing');
  assert.ok(!existsSync(join(d, '.chalk', 'archive')), 'dry-run creates no archive dir');

  const run = chalk(d, 'archive');
  assert.equal(run.code, 0, run.out);
  // (event count includes A's own task-created event from `chalk task add` — not pinned)
  assert.match(run.out, /archived 1 task\(s\) \+ \d+ event line\(s\)/);

  const live = tasksOf(d);
  assert.deepEqual(live.map((t) => t.title).sort(), ['B ships', 'C ships', 'D depends on B', 'E wip'], 'only A moved');
  const arch = JSON.parse(readFileSync(join(d, '.chalk', 'archive', `tasks-${YEAR}.json`), 'utf8'));
  assert.equal(arch.length, 1);
  assert.equal(arch[0].id, A.id);
  assert.ok(arch[0].archivedAt, 'stamped when it moved');

  const liveEvents = readFileSync(join(d, '.chalk', 'updates.jsonl'), 'utf8');
  assert.doesNotMatch(liveEvents, /"a1"|"a2"/, "A's events left the live log");
  assert.match(liveEvents, /"b1"/, "B's events stayed (B was kept)");
  assert.match(liveEvents, /global decision/, 'global events always stay');
  const archEvents = readFileSync(join(d, '.chalk', 'archive', `updates-${YEAR}.jsonl`), 'utf8');
  assert.match(archEvents, /"a1"/); assert.match(archEvents, /"a2"/);

  // Live spine still coherent for the runtime: backlog renders, release still sees C (not A twice).
  assert.equal(chalk(d, 'backlog').code, 0);
  const rel = chalk(d, 'release', '--dry-run');
  assert.match(rel.out, /C ships/, 'the unreleased done task is still releasable');
  assert.doesNotMatch(rel.out, /A ships/, 'the archived task is never re-released');

  // Idempotent: nothing left to move (B still dep-referenced, C unreleased).
  const again = chalk(d, 'archive');
  assert.match(again.out, /nothing to move/);
  void C; void E;
});

test('archive — the portal still shows delivered history from the archive', () => {
  const { d } = seeded();
  chalk(d, 'archive');
  const p = chalk(d, 'portal');
  assert.equal(p.code, 0, p.out);
  const scope = readFileSync(join(d, '.project', 'scope', 'defined.yaml'), 'utf8');
  assert.match(scope, /A ships/, 'archived-but-shipped work stays visible to the client');
  assert.match(scope, /delivered/);
});
