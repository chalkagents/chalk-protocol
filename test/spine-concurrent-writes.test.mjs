// Spine write safety under concurrency (#110 slice 2). Two chalk processes (parallel work/done/start
// in separate worktrees over ONE spine) each do a read-modify-write of tasks.json. With a plain
// writeFileSync and no lock the reads overlap and the last writer wins — silently dropping the other
// process's task. upsertTask now runs its read-modify-write UNDER a cross-process advisory lock and
// RE-READS inside it, so every concurrent add of a distinct task survives; writeJSON is atomic
// (temp + rename) so no reader ever sees a torn file. Locked contract for #110 slice 2.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { runArchive } from '../lib/archive.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-conc-'));
  execSync('git init -q', { cwd: d });
  spawnSync('node', [CLI, 'init', '--name', 'p'], { cwd: d, encoding: 'utf8' });
  return d;
}
// Drop a lock file whose mtime is `ageMs` in the past — a crashed holder the live lock must reclaim.
function staleLock(root, ageMs) {
  const p = join(root, '.chalk', '.lock');
  writeFileSync(p, '99999 crashed-holder');
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(p, when, when);
  return p;
}
// Run N `chalk task add` processes truly concurrently (spawn, not spawnSync) and resolve when all exit.
const addAll = (d, n) => Promise.all(Array.from({ length: n }, (_, i) =>
  new Promise((res) => spawn('node', [CLI, 'task', 'add', `feat: concurrent-${i}`], { cwd: d, stdio: 'ignore' }).on('close', res)),
));

test('N concurrent task adds all land — no lost update (spine lock)', async () => {
  const d = repo();
  const N = 16;
  await addAll(d, N);
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.equal(tasks.length, N, `all ${N} concurrent adds must survive the read-modify-write race, got ${tasks.length}`);
  const titles = new Set(tasks.map((t) => t.title));
  assert.equal(titles.size, N, 'every added task is distinct and present');
});

test('atomic writes leave no .tmp residue and the spine stays valid JSON', async () => {
  const d = repo();
  await addAll(d, 8);
  const stray = readdirSync(join(d, '.chalk')).filter((f) => f.includes('.tmp'));
  assert.deepEqual(stray, [], `atomic rename must leave no temp files behind: ${stray.join(', ')}`);
  assert.doesNotThrow(() => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8')), 'tasks.json is always complete, valid JSON');
});

test('a concurrent reader NEVER sees a torn tasks.json mid-write (atomic temp+rename)', async () => {
  const d = repo();
  // A big payload makes each write span several write() syscalls, WIDENING the truncate-then-write
  // window a plain writeFileSync exposes. saveTasks is NOT lock-guarded, so this isolates the atomic
  // -write property (independent of the upsert lock): the reader takes no lock and would catch a
  // partial file. With temp+rename it only ever sees the old or new COMPLETE file.
  const writer = `
    import { Store } from ${JSON.stringify(join(REPO_ROOT, 'lib/store.mjs'))};
    const s = new Store(${JSON.stringify(d)});
    const big = Array.from({ length: 800 }, (_, i) => ({ id: 'task-' + i, title: 'x'.repeat(400), state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] }));
    for (let k = 0; k < 150; k++) s.saveTasks(big);
  `;
  const child = spawn('node', ['--input-type=module', '-e', writer], { cwd: d, stdio: 'ignore' });
  const tasksPath = join(d, '.chalk/tasks.json');
  let reads = 0, torn = 0, done = false;
  child.on('close', () => { done = true; });
  await new Promise((res) => {
    const loop = () => {
      for (let i = 0; i < 40; i++) { reads++; try { JSON.parse(readFileSync(tasksPath, 'utf8')); } catch { torn++; } }
      if (done) res(); else setImmediate(loop);
    };
    loop();
  });
  assert.ok(reads > 200, `the reader must actually race the writer (did ${reads} reads)`);
  assert.equal(torn, 0, `a concurrent reader must never see a torn/partial file, saw ${torn}/${reads} torn reads`);
});

test('a stale lock (crashed holder) is stolen so the spine is not wedged forever', () => {
  const d = repo();
  const lock = staleLock(d, 60_000); // 60s old — past LOCK_STALE_MS (30s)
  const store = new Store(d);
  store.upsertTask({ id: 'task-aaaaaaaa', title: 'feat: after-steal', state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] });
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.ok(tasks.some((t) => t.id === 'task-aaaaaaaa'), 'the mutation succeeds after stealing the stale lock');
  assert.equal(existsSync(lock), false, 'the stale lock is reclaimed and released, not left behind');
});

test('archive routes its read-modify-write through the spine lock (steals a stale lock)', () => {
  const d = repo();
  const store = new Store(d);
  store.upsertTask({ id: 'task-dddddddd', title: 'feat: shipped', state: 'done', released: true, acceptanceCriteria: [], tests: [], reviews: [] });
  const lock = staleLock(d, 60_000);
  runArchive(store); // if archive bypassed the lock (old code), the stale lock would remain untouched
  const live = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.ok(!live.some((t) => t.id === 'task-dddddddd'), 'the released task was archived out of the live spine');
  assert.equal(existsSync(lock), false, 'archive acquired + released the lock (stole the stale one) — it did not bypass it');
});

test('the lock file and atomic-write temp files are gitignored (never committed)', () => {
  // check-ignore against the REAL project .gitignore (the temp repos are bare `git init`s).
  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: REPO_ROOT }).status === 0;
  assert.ok(ignored('.chalk/.lock'), '.chalk/.lock must be gitignored');
  assert.ok(ignored('.chalk/tasks.json.12345.tmp'), 'the atomic-write temp pattern (.chalk/*.tmp) must be gitignored');
});
