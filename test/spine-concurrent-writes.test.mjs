// Spine write safety under concurrency (#110 slice 2). Two chalk processes (parallel work/done/start
// in separate worktrees over ONE spine) each do a read-modify-write of tasks.json. With a plain
// writeFileSync and no lock the reads overlap and the last writer wins — silently dropping the other
// process's task. upsertTask now runs its read-modify-write UNDER a cross-process advisory lock and
// RE-READS inside it, so every concurrent add of a distinct task survives; writeJSON is atomic
// (temp + rename) so no reader ever sees a torn file. Locked contract for #110 slice 2.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn, execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { retireLockGeneration, Store } from '../lib/store.mjs';
import { runArchive } from '../lib/archive.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_URL = pathToFileURL(join(REPO_ROOT, 'lib/store.mjs')).href;
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-conc-'));
  execSync('git init -q', { cwd: d });
  spawnSync('node', [CLI, 'init', '--name', 'p'], { cwd: d, encoding: 'utf8' });
  return d;
}
// Drop a lock file whose mtime is `ageMs` in the past — a crashed holder the live lock must reclaim.
function staleLock(root, ageMs) {
  const p = join(root, '.chalk', '.lock');
  mkdirSync(p); writeFileSync(join(p, 'owner'), '99999 crashed-holder');
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(p, when, when);
  return p;
}
// Run N `chalk task add` processes truly concurrently (spawn, not spawnSync) and resolve when all exit.
const addAll = (d, n) => Promise.all(Array.from({ length: n }, (_, i) =>
  new Promise((res) => {
    const child = spawn(process.execPath, [CLI, 'task', 'add', `feat: concurrent-${i}`], { cwd: d, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => res({ code, signal, stderr }));
  }),
));
test('N concurrent task adds all land — no lost update (spine lock)', async () => {
  const d = repo();
  const N = 16;
  const results = await addAll(d, N);
  assert.ok(results.every((result) => result.code === 0), `every concurrent writer must exit cleanly: ${JSON.stringify(results.filter((result) => result.code !== 0))}`);
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.equal(tasks.length, N, `all ${N} concurrent adds must survive the read-modify-write race, got ${tasks.length}`);
  const titles = new Set(tasks.map((t) => t.title));
  assert.equal(titles.size, N, 'every added task is distinct and present');
});

test('the cross-process lock claims a directory owner and removes only its own live name', async () => {
  const d = repo();
  const lock = join(d, '.chalk', '.lock');
  const holder = `
    import { readFileSync } from 'node:fs';
    import { Store } from ${JSON.stringify(STORE_URL)};
    new Store(${JSON.stringify(d)}).withLock(() => readFileSync(0, 'utf8'));
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', holder], { cwd: d, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let childDone = false, holderTimedOut = false;
  const closed = new Promise((resolve) => child.on('close', (code) => { childDone = true; resolve(code); }));
  const killTimer = setTimeout(() => { holderTimedOut = true; child.kill(); }, 35_000);
  const deadline = Date.now() + 30_000;
  const owner = join(lock, 'owner');
  let observedOwner = '';
  while (!/^\d+-[0-9a-f-]+ /.test(observedOwner) && !childDone && Date.now() < deadline) {
    try { observedOwner = readFileSync(owner, 'utf8'); } catch { observedOwner = ''; }
    if (!/^\d+-[0-9a-f-]+ /.test(observedOwner)) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const lockWasDirectory = existsSync(lock) && statSync(lock).isDirectory();
  child.stdin.end();
  const childCode = await closed;
  clearTimeout(killTimer);
  assert.equal(holderTimedOut, false, `holder must not spin past its deadline: ${stderr}`);
  assert.match(observedOwner, /^\d+-[0-9a-f-]+ /, `holder exposes a complete owner claim while its critical section runs: ${stderr}`);
  assert.equal(lockWasDirectory, true, 'the portable lock primitive starts with atomic directory creation');
  assert.equal(childCode, 0, stderr);
  assert.equal(existsSync(lock), false, 'the owner removes the live lock name on release');
  assert.equal(readdirSync(join(d, '.chalk', '.locks')).filter((name) => name !== '.gitignore').length, 1, 'normal release keeps its generation tombstone as an ABA guard');
});

test('stale takeover retires one generation and a delayed actor cannot rename its replacement', () => {
  const d = repo();
  const lock = join(d, '.chalk', '.lock');
  const oldToken = '111-old-generation';
  mkdirSync(lock); writeFileSync(join(lock, 'owner'), oldToken);
  const old = (Date.now() - 60_000) / 1000;
  utimesSync(lock, old, old);
  assert.equal(retireLockGeneration(lock, oldToken, { requireStale: true }), true, 'one stale actor retires the observed generation');
  const retiredDir = join(d, '.chalk', '.locks');
  const tombstone = join(retiredDir, readdirSync(retiredDir).find((name) => name !== '.gitignore'));
  assert.equal(readFileSync(join(tombstone, 'owner'), 'utf8'), oldToken, 'the non-empty generation tombstone remains as the ABA guard');

  const freshToken = '222-fresh-replacement';
  mkdirSync(lock); writeFileSync(join(lock, 'owner'), freshToken);
  assert.throws(() => renameSync(lock, tombstone), 'a T actor paused before rename cannot replace T+1 with the existing non-empty T tombstone');
  assert.equal(retireLockGeneration(lock, oldToken), false, 'a delayed old actor loses against its existing tombstone');
  assert.equal(readFileSync(join(lock, 'owner'), 'utf8'), freshToken, 'the fresh replacement remains live');
  assert.equal(retireLockGeneration(lock, freshToken, { requireStale: true }), false, 'fresh generations are never retired as stale');
  rmSync(lock, { recursive: true, force: true });
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
    import { Store } from ${JSON.stringify(STORE_URL)};
    const s = new Store(${JSON.stringify(d)});
    const big = Array.from({ length: 800 }, (_, i) => ({ id: 'task-' + i, title: 'x'.repeat(400), state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] }));
    for (let k = 0; k < 150; k++) s.saveTasks(big);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', writer], { cwd: d, stdio: 'ignore' });
  const tasksPath = join(d, '.chalk/tasks.json');
  let reads = 0, torn = 0, done = false, writerCode = null;
  child.on('close', (code) => { writerCode = code; done = true; });
  await new Promise((res) => {
    const loop = () => {
      for (let i = 0; i < 40; i++) { reads++; try { JSON.parse(readFileSync(tasksPath, 'utf8')); } catch { torn++; } }
      if (done) res(); else setImmediate(loop);
    };
    loop();
  });
  assert.equal(writerCode, 0, 'the concurrent writer fixture must execute successfully');
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

test('an ownerless directory left by an older crashed holder is reclaimed once stale', () => {
  const d = repo();
  const lock = join(d, '.chalk', '.lock');
  mkdirSync(lock);
  const old = (Date.now() - 60_000) / 1000;
  utimesSync(lock, old, old);
  const store = new Store(d);
  store.upsertTask({ id: 'task-bbbbbbbb', title: 'feat: after-ownerless-crash', state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] });
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.ok(tasks.some((t) => t.id === 'task-bbbbbbbb'), 'the mutation succeeds after retiring an ownerless stale directory');
  assert.equal(existsSync(lock), false, 'the ownerless stale generation is reclaimed and the replacement releases cleanly');
  const retired = readdirSync(join(d, '.chalk', '.locks')).filter((name) => name !== '.gitignore');
  assert.equal(retired.length, 2, 'ownerless recovery and its replacement each leave one stable generation tombstone');
});

test('a zero-byte owner file interrupted during creation is reclaimed without spinning', async () => {
  const d = repo();
  const lock = join(d, '.chalk', '.lock');
  mkdirSync(lock); writeFileSync(join(lock, 'owner'), '');
  const old = (Date.now() - 60_000) / 1000;
  utimesSync(lock, old, old);
  const recover = `
    import { Store } from ${JSON.stringify(STORE_URL)};
    new Store(${JSON.stringify(d)}).upsertTask({ id: 'task-eeeeeeee', title: 'feat: after-empty-owner-crash', state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', recover], { cwd: d, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', timedOut = false;
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 10_000);
  const result = await new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  assert.equal(timedOut, false, `recovery must not spin past its deadline: ${JSON.stringify({ result, stderr })}`);
  assert.equal(result.code, 0, stderr);
  const tasks = JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));
  assert.ok(tasks.some((t) => t.id === 'task-eeeeeeee'), 'the mutation succeeds after retiring the interrupted owner claim');
  assert.equal(existsSync(lock), false, 'the zero-byte owner generation is reclaimed and released');
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
  const d = repo();
  mkdirSync(join(d, '.chalk', '.locks')); writeFileSync(join(d, '.chalk', '.locks', '.gitignore'), '');
  new Store(d).upsertTask({ id: 'task-cccccccc', title: 'feat: create-runtime-guards', state: 'todo', acceptanceCriteria: [], tests: [], reviews: [] });
  const ignored = (cwd, rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd }).status === 0;
  assert.ok(ignored(REPO_ROOT, '.chalk/.lock'), 'upgraded projects keep the root-level lock ignore');
  assert.ok(ignored(d, '.chalk/.locks/fake-generation'), 'every spine self-ignores persistent generation tombstones at runtime');
  assert.ok(ignored(d, '.chalk/.locks/.gitignore'), 'the local ignore file does not dirty upgraded repositories');
  assert.equal(readFileSync(join(d, '.chalk', '.locks', '.gitignore'), 'utf8'), '*\n', 'an interrupted empty ignore file is atomically repaired');
  assert.equal(execSync('git status --porcelain .chalk/.locks', { cwd: d, encoding: 'utf8' }).trim(), '', 'runtime guards stay invisible in an upgraded repo with no root ignore rules');
  assert.ok(ignored(REPO_ROOT, '.chalk/tasks.json.12345.tmp'), 'upgraded projects keep the atomic-write temp ignore');
});
