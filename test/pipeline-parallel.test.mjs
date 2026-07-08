// Parallel issue→merge driver (#110 slice 3). `chalk pipeline --parallel N` fans out per-task chains
// (branch..evidence) up to N at once — each in its own worktree — then SERIALIZES the merges, which
// squash onto the shared base branch and would otherwise contend. The git/gh-heavy stage runners are
// injectable, so this suite pins the orchestration INVARIANTS deterministically: chains overlap but
// never exceed the limit, merges never overlap, and a chain (or merge) that fails blocks its task
// rather than being merged. Locked contract for #110 slice 3.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline, runPipelineParallel } from '../lib/pipeline.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// A store with N issue-backed, mergeable tasks — the only surface runPipelineParallel reads.
const fakeStore = (n) => ({
  root: '/tmp/none',
  tasks: () => Array.from({ length: n }, (_, i) => ({ id: `task-${i}`, title: `t${i}`, issue: { number: i }, state: 'specd' })),
});

test('chains overlap up to the limit, and merges never overlap', async () => {
  const N = 6, LIMIT = 2;
  let liveChains = 0, maxChains = 0, liveMerges = 0, maxMerges = 0;
  const r = await runPipelineParallel(fakeStore(N), 'cli', {
    parallel: LIMIT,
    runChain: async () => { liveChains++; maxChains = Math.max(maxChains, liveChains); await delay(20); liveChains--; return { status: 0 }; },
    runMerge: async () => { liveMerges++; maxMerges = Math.max(maxMerges, liveMerges); await delay(10); liveMerges--; return { status: 0 }; },
  });
  assert.ok(maxChains > 1, `chains must actually run concurrently, saw max ${maxChains}`);
  assert.ok(maxChains <= LIMIT, `chains must not exceed the limit ${LIMIT}, saw ${maxChains}`);
  assert.equal(maxMerges, 1, `merges must be serialized (never concurrent), saw ${maxMerges}`);
  assert.equal(r.merged.length, N, 'all chains that reached merge are merged');
  assert.deepEqual(r.blocked, []);
  assert.equal(r.parallel, LIMIT);
});

test('every task is chained even when the pool is smaller than the queue', async () => {
  const N = 10;
  const chained = new Set();
  await runPipelineParallel(fakeStore(N), 'cli', {
    parallel: 3,
    runChain: async (t) => { chained.add(t.id); return { status: 0 }; },
    runMerge: async () => ({ status: 0 }),
  });
  assert.equal(chained.size, N, 'no task is dropped by the concurrency pool');
});

test('a chain that blocks is NOT merged; the rest still merge', async () => {
  const merges = [];
  const r = await runPipelineParallel(fakeStore(4), 'cli', {
    parallel: 4,
    runChain: async (t) => ({ status: t.id === 'task-2' ? 3 : 0 }), // task-2 auto-blocked in its own chain
    runMerge: async (t) => { merges.push(t.id); return { status: 0 }; },
  });
  assert.ok(!merges.includes('task-2'), 'a blocked chain must never reach merge');
  assert.ok(r.blocked.includes('task-2'), 'the blocked task is reported blocked');
  assert.equal(r.merged.length, 3);
  assert.equal(merges.length, 3);
});

test('a merge failure blocks that task even though its chain passed', async () => {
  const r = await runPipelineParallel(fakeStore(3), 'cli', {
    parallel: 2,
    runChain: async () => ({ status: 0 }),
    runMerge: async (t) => ({ status: t.id === 'task-1' ? 2 : 0 }), // the gate refuses task-1's merge
  });
  assert.ok(r.blocked.includes('task-1'), 'a failed merge blocks the task');
  assert.deepEqual(r.merged.sort(), ['task-0', 'task-2']);
});

// --- the DEFAULT production path (no injected runners) ---

test('stopBefore truncates the chain before that stage (the merge is run separately, serialized)', () => {
  const store = { root: '/tmp/none', protocol: () => ({}), tasks: () => [{ id: 'task-0', title: 't', issue: { number: 0 }, state: 'specd' }] };
  const full = []; runPipeline(store, 'cli', { dryRun: true, log: (m) => full.push(m) });
  const stopped = []; runPipeline(store, 'cli', { dryRun: true, stopBefore: 'merge', log: (m) => stopped.push(m) });
  assert.match(full.join('\n'), /merge/, 'the full chain includes merge');
  assert.doesNotMatch(stopped.join('\n'), /merge/, 'stopBefore:merge drops merge from the chain (the driver merges separately)');
});

test('default runners spawn `pipeline --only <id> --stop-before merge` per chain, then `merge` after ALL chains', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalk-stub-'));
  const log = join(dir, 'calls.log');
  const stub = join(dir, 'stub.mjs');
  // A stand-in CLI that records each invocation's argv and exits 0 — so we observe exactly what the
  // default runChain/runMerge spawn, without a live git/gh repo.
  writeFileSync(stub, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.exit(0);\n`);
  // The default runners spawn with cwd: store.root, so it must be a REAL directory.
  const store = { root: dir, tasks: fakeStore(3).tasks };
  return runPipelineParallel(store, stub, { parallel: 2 }).then((r) => {
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const chains = calls.filter((c) => c[0] === 'pipeline');
    const merges = calls.filter((c) => c[0] === 'merge');
    assert.equal(chains.length, 3, 'one chain subprocess per task');
    for (const c of chains) {
      assert.deepEqual(c.slice(-2), ['--stop-before', 'merge'], 'each chain stops before merge');
      assert.ok(c.includes('--only') && /^task-\d$/.test(c[c.indexOf('--only') + 1]), 'each chain targets one task by id');
    }
    assert.equal(merges.length, 3, 'one merge subprocess per merged task');
    // Phase ordering / serialization: every merge is recorded AFTER every chain (Phase B follows A).
    const lastChain = calls.map((c) => c[0]).lastIndexOf('pipeline');
    const firstMerge = calls.map((c) => c[0]).indexOf('merge');
    assert.ok(firstMerge > lastChain, 'all merges run after all chains complete (serialized at the gate)');
    assert.equal(r.merged.length, 3);
  });
});
