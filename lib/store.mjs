// Chalk Protocol — spine store. Reads/writes the .chalk/ directory.
// Zero dependencies. The spine is the product; this module is its only writer.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, openSync, writeSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './config.mjs';
import { CLAUDE_COMMANDS } from './onboard.mjs';

export const PROTOCOL = 'chalk/0';
// The chalk-protocol package version of the RUNNING binary — read once from our own package.json.
// The spine records which version last wrote it (writerVersion) so we can detect version skew when a
// newer/older binary opens a spine written by another (#159). Falls back to 0.0.0 off-package.
export const CHALK_VERSION = (() => {
  try { return JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();
// Current chalk.json SCHEMA version. Bump when the spine's on-disk shape changes, and add a matching
// step to MIGRATIONS so `chalk migrate` can carry an older spine forward. '1.0' spines predate the
// writerVersion stamp (#159).
export const SCHEMA_VERSION = '1.1';
// Compare dotted semver strings → -1 | 0 | 1 (missing/invalid treated as 0). Zero-dep.
export function cmpSemver(a, b) {
  const p = (v) => String(v || '0.0.0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a0, a1, a2] = p(a), [b0, b1, b2] = p(b);
  return a0 - b0 || a1 - b1 || a2 - b2 ? Math.sign(a0 - b0 || a1 - b1 || a2 - b2) : 0;
}
// Ordered, per-schema migration steps. Each carries a spine from `from` to `to`, mutating `meta` (and
// optionally `tasks`) IN PLACE. `chalk migrate` chains them; a spine already at SCHEMA_VERSION is a
// no-op. Keep them idempotent and additive — never destructive — so a backup + re-run is always safe.
export const MIGRATIONS = [
  { from: '1.0', to: '1.1', describe: 'stamp the writer version (chalk-protocol package) on the spine',
    apply: (meta) => { meta.writerVersion = meta.writerVersion || CHALK_VERSION; } },
];
// The ordered steps needed to bring `meta` to SCHEMA_VERSION (empty when already current).
export function planMigrations(meta) {
  let v = meta?.version || '1.0';
  const steps = [];
  for (const m of MIGRATIONS) if (m.from === v) { steps.push(m); v = m.to; }
  return steps;
}
// Version-skew verdict for a spine (#159): 'newer' (written by a newer chalk than this binary — unsafe
// to read), 'needs-migrate' (an older schema a migration can carry forward), or 'ok'.
export function spineSkew(meta) {
  const writer = meta?.writerVersion;
  if (writer && cmpSemver(writer, CHALK_VERSION) > 0) return { status: 'newer', writer, running: CHALK_VERSION };
  if (planMigrations(meta || {}).length) return { status: 'needs-migrate', from: meta?.version || '1.0', to: SCHEMA_VERSION };
  return { status: 'ok' };
}
export const PHASES = ['discovery', 'spec', 'design', 'build', 'review', 'ship'];
export const TASK_STATES = ['todo', 'specd', 'in-progress', 'blocked', 'done'];
// What a blocked task is waiting on — only a human can supply these.
// `review` is agent-owned (chalk's own adversarial reviewer blocked the change — fix the findings
// and re-review), unlike the others, which wait on a human or an upstream task.
export const NEEDS = ['creds', 'decision', 'human-input', 'upstream', 'review'];

// Spine STATE — chalk's own bookkeeping files/dirs, NOT the change under review and NOT a contract
// artifact. Two gates must agree on this exact set (#131): issue intake COMMITS them so a batch's
// tasks.json/board churn never floats into the next task branch (#114), and the reviewer EXCLUDES
// them from the diff so the adversary's attention isn't burned on queue metadata. Defining it once
// here keeps the two from silently diverging — when intake carried only a SUBSET, a review-excluded
// path (e.g. chalk.json, questions.json) was left uncommitted and re-opened the scoped-diff leak.
// Contract ARTIFACTS (`.chalk/tests/` e2e specs, `.chalk/evidence/`) are deliberately NOT here: they
// are part of what a change delivers, so they stay visible to review and are committed by
// `chalk commit`/`chalk evidence`. Consumers format as needed (intake: raw paths filtered by
// existence; reviewer: `:(exclude)` pathspecs).
export const SPINE_STATE_PATHS = [
  '.chalk/tasks.json', '.chalk/chalk.json', '.chalk/updates.jsonl', '.chalk/questions.json',
  '.chalk/decisions.md', '.chalk/director.jsonl', '.chalk/lessons.md', '.chalk/boards', '.chalk/plans',
  '.chalk/handoffs', '.chalk/analysis',
];

// Portal-compatible update-type vocabulary (subset we emit from code).
export const UPDATE_TYPES = [
  'progress-update', 'milestone-hit', 'decision-logged', 'lesson-learned', 'planning-generated',
  'work-item-started', 'work-item-submitted', 'work-item-accepted', 'question-answered',
];

// How many of the most-recent lessons are injected into an agent's context. `chalk lesson list`
// mirrors this cap so the listed lessons are exactly the set agents actually see (use --all for full history).
export const LESSON_CAP = 15;
// Byte budget for `chalk context` (#81). Generous — a large/old project's lessons.md would otherwise
// grow the injected context without bound and silently degrade the executor (or hit stdin limits).
// Only the lessons block is trimmed to fit; the task's criteria/tests/handoff/contract are essential.
export const DEFAULT_CONTEXT_BUDGET = 65536;

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Walk up from `start` to find an existing .chalk/ dir. Returns its parent (project root).
const walkUpForChalk = (start) => {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, '.chalk', 'chalk.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

// If `start` sits inside a LINKED git worktree, return { toplevel, mainRoot } — the worktree's own
// top directory and the MAIN checkout's top directory. Otherwise null. Detection reads git's own
// files (no subprocess): a linked worktree's `.git` is a FILE ("gitdir: <path>") pointing at
// `<main>/.git/worktrees/<name>`, whose `commondir` file resolves to `<main>/.git`. The main
// checkout's `.git` is a DIRECTORY, so it returns null fast (no work on the common path).
function linkedWorktree(start) {
  let dir = resolve(start);
  while (true) {
    const dotgit = join(dir, '.git');
    if (existsSync(dotgit)) {
      let st; try { st = statSync(dotgit); } catch { return null; }
      if (st.isDirectory()) return null; // main checkout — nothing to redirect
      if (!st.isFile()) return null;
      try {
        const m = readFileSync(dotgit, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
        if (!m) return null;
        const gitdir = resolve(dir, m[1]); // <main>/.git/worktrees/<name>
        const common = resolve(gitdir, readFileSync(join(gitdir, 'commondir'), 'utf8').trim()); // <main>/.git
        return { toplevel: dir, mainRoot: dirname(common) };
      } catch { return null; }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function findRoot(start = process.cwd()) {
  const local = walkUpForChalk(start);
  // Single-canonical spine (Finding #4): inside a linked worktree, the spine lives in the MAIN
  // checkout — but at the SAME path the project occupies WITHIN the worktree (a monorepo can hold a
  // chalk project in a subdir). Map worktree→main by that relative path, and only redirect when the
  // mapped main location actually has its own `.chalk/chalk.json` (so a nested/foreign project never
  // resolves to the wrong outer spine). A stale committed `.chalk` in the worktree is thereby ignored.
  const wt = linkedWorktree(start);
  if (wt) {
    const rel = relative(wt.toplevel, local || resolve(start));
    if (!rel.startsWith('..')) {
      const canonical = resolve(wt.mainRoot, rel);
      if (canonical !== local && existsSync(join(canonical, '.chalk', 'chalk.json'))) return canonical;
    }
  }
  return local;
}

export function requireRoot() {
  const root = findRoot();
  if (!root) {
    throw new Error('No .chalk/ found. Run `chalk init` in your project root first.');
  }
  return root;
}

const paths = (root) => {
  const base = join(root, '.chalk');
  return {
    base,
    chalk: join(base, 'chalk.json'),
    tasks: join(base, 'tasks.json'),
    spec: join(base, 'spec.md'),
    decisions: join(base, 'decisions.md'),
    lessons: join(base, 'lessons.md'),
    cost: join(base, 'local', 'cost.jsonl'), // gitignored runtime ledger of agent calls
    updates: join(base, 'updates.jsonl'),
    director: join(base, 'director.jsonl'), // durable, compounding record of the director's accept/redirect calls (#201)
    questions: join(base, 'questions.json'),
    spineHashes: join(base, 'local', 'spine.hashes.json'), // gitignored tamper-evidence baseline (#79)
    telemetry: join(base, 'local', 'telemetry.json'), // gitignored anonymous install-id + sent-milestone flags (#154)
  };
};

const readJSON = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
// Atomic write (#110): serialize to a sibling temp file, then rename over the target. rename(2) is
// atomic within a filesystem, so a concurrent reader sees either the old or the new COMPLETE file —
// never the truncate-then-write window a plain writeFileSync exposes. The temp name carries the pid
// so two writers never collide on the temp itself.
const writeJSON = (p, v) => {
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n');
  renameSync(tmp, p);
};

// Synchronous sleep for the spine lock's poll loop — Atomics.wait blocks the thread without a busy
// spin (the store API is entirely synchronous, so we cannot yield to the event loop here).
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* SAB unavailable — fall through */ } };
const LOCK_POLL_MS = 15;    // how often to retry acquiring a held lock
const LOCK_WAIT_MS = 15000; // give up waiting on a live holder (backstop against a wedged spine)
const LOCK_STALE_MS = 30000; // a lock older than this is a crashed holder's — steal it

// Cost-ledger warn-once flag — deliberately MODULE-level (per process, not per Store instance):
// long-lived drivers re-open the store per task, and one broken disk must not warn per task.
let costWarned = false;

export class Store {
  constructor(root) {
    this.root = root;
    this.p = paths(root);
  }

  static open() {
    const s = new Store(requireRoot());
    // Refuse to operate on a spine written by a NEWER chalk than this binary (#159): an older binary
    // can misread a newer schema and corrupt it on the next write. Remediation is to upgrade the
    // package. An OLDER spine (needs-migrate) is NOT refused here — that would block `chalk migrate`
    // itself; it's surfaced as a doctor warning + the migrate prompt instead.
    const skew = spineSkew(s.meta());
    if (skew.status === 'newer')
      throw new Error(`this .chalk/ spine was written by chalk-protocol ${skew.writer}, but you are running ${skew.running}.\n  Upgrade to read it safely:  npm i -g chalk-protocol@latest  (refusing to operate on a newer spine to avoid corrupting it).`);
    return s;
  }

  // --- meta (chalk.json) ---
  meta() { return readJSON(this.p.chalk, null); }
  saveMeta(meta) {
    meta.updatedAt = now();
    // Self-describe the writer on every spine write (#159) — the last chalk-protocol version to touch
    // it. This does NOT bump the schema `version` (that is `chalk migrate`'s job): recording who wrote
    // the spine is additive, not a schema change.
    meta.writerVersion = CHALK_VERSION;
    writeJSON(this.p.chalk, meta);
    if (meta?.protocol?.tamperEvident) this.recordSpineHashes();
    return meta;
  }

  // --- tamper-evidence (#79, opt-in via protocol.tamperEvident): the spine's authority files
  // (chalk.json, tasks.json) are only process-discipline-protected in manual mode — nothing detects
  // an agent hand-editing tasks.json (mark-done-by-hand) or weakening chalk.json's verify commands.
  // When enabled, after every chalk write we record the files' hashes in gitignored .chalk/local/;
  // a later invocation whose on-disk hash differs from the recorded one was changed OUTSIDE chalk,
  // and we say so loudly. This is NOT a lock — the threat model is a sloppy/pressured agent, not a
  // malicious human (who could rewrite the baseline). Default off, like the other hardening knobs.
  spineGuarded() { return { 'chalk.json': this.p.chalk, 'tasks.json': this.p.tasks }; }
  recordSpineHashes() {
    const rec = { at: now(), hashes: {} };
    for (const [name, path] of Object.entries(this.spineGuarded())) {
      if (existsSync(path)) rec.hashes[name] = sha256(readFileSync(path));
    }
    try { mkdirSync(dirname(this.p.spineHashes), { recursive: true }); writeJSON(this.p.spineHashes, rec); } catch { /* best-effort baseline */ }
  }
  // Files whose current on-disk hash differs from the last chalk-recorded baseline. Empty when there
  // is no baseline yet (fresh/upgraded repo — fail-safe: the next chalk write establishes one).
  spineTamper() {
    if (!existsSync(this.p.spineHashes)) return [];
    const rec = readJSON(this.p.spineHashes, null);
    if (!rec?.hashes) return [];
    const drifted = [];
    for (const [name, path] of Object.entries(this.spineGuarded())) {
      const recorded = rec.hashes[name];
      if (recorded === undefined) continue; // not baselined (e.g. file created later) — nothing to compare
      const current = existsSync(path) ? sha256(readFileSync(path)) : null;
      if (current !== recorded) drifted.push({ file: name, recordedAt: rec.at });
    }
    return drifted;
  }
  // Protocol config lives under the `protocol` key so chalk.json's top level stays a clean
  // canonical citizen. `protocol()` reads it; never read meta.verify/phase/etc directly.
  protocol() { return this.meta()?.protocol || {}; }
  phase() { return this.protocol().phase; }
  setPhase(phase) {
    const m = this.meta();
    (m.protocol = m.protocol || {}).phase = phase;
    return this.saveMeta(m);
  }

  // --- tasks ---
  tasks() { return readJSON(this.p.tasks, []); }
  saveTasks(tasks) { writeJSON(this.p.tasks, tasks); if (this.protocol()?.tamperEvident) this.recordSpineHashes(); }
  task(idOrPrefix) {
    const tasks = this.tasks();
    return tasks.find((t) => t.id === idOrPrefix)
      || tasks.find((t) => t.id.startsWith(idOrPrefix));
  }
  // Cross-process advisory lock over the spine (#110). Two concurrent chalk processes (parallel
  // `work`/`done`/`start` in separate worktrees, one spine) otherwise race on a read-modify-write of
  // tasks.json — last writer wins, silently dropping the other's update. `wx` open is an atomic
  // create-if-absent: whoever wins holds the lock; the rest poll, stealing a lock whose holder
  // crashed (older than LOCK_STALE_MS) so a dead process can't wedge the spine forever. Best-effort by
  // design — if we can't acquire within LOCK_WAIT_MS we proceed unlocked rather than hang. Synchronous
  // (fd + finally-unlink), non-reentrant: never call withLock from inside a withLock body.
  withLock(fn) {
    const lockPath = join(this.p.base, '.lock');
    const start = Date.now();
    let fd = null;
    for (;;) {
      try { fd = openSync(lockPath, 'wx'); break; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let stale = true;
        try { stale = Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS; } catch { /* vanished — retry */ }
        if (stale) {
          // Steal atomically so two waiters can't both unlink and end up double-holding (a plain
          // stat-then-unlink is TOCTOU: B could refresh the lock between A's stat and A's unlink, and A
          // would delete B's LIVE lock). rename(2) is atomic — exactly one stealer captures a given
          // lock file; the loser's rename ENOENTs and it simply retries the open.
          try { const captured = `${lockPath}.stale.${process.pid}.${Date.now()}`; renameSync(lockPath, captured); unlinkSync(captured); }
          catch { /* another waiter captured it first — retry the open */ }
          continue;
        }
        if (Date.now() - start > LOCK_WAIT_MS) break; // backstop: proceed unlocked rather than deadlock
        sleepSync(LOCK_POLL_MS);
      }
    }
    try {
      if (fd !== null) { try { writeSync(fd, `${process.pid} ${now()}`); } catch { /* diagnostic only */ } }
      return fn();
    } finally {
      if (fd !== null) { try { closeSync(fd); } catch { /* already closed */ } try { unlinkSync(lockPath); } catch { /* already stolen/removed */ } }
    }
  }

  // The ONE safe read-modify-write of tasks.json (#110): under the spine lock, re-read the freshest
  // on-disk set, hand it to `fn`, and persist what it returns. Every concurrent mutator (upsert,
  // archive, …) must route through here so their read+write interleave atomically — otherwise a
  // mutator working from a stale in-memory array clobbers a concurrent writer (last-writer-wins).
  mutateTasks(fn) {
    return this.withLock(() => {
      const next = fn(this.tasks());
      this.saveTasks(next);
      return next;
    });
  }

  // Insert or replace one task by id — merges only this task into the freshest on-disk set, so a
  // concurrent upsert of a DIFFERENT task is never lost.
  upsertTask(task) {
    this.mutateTasks((tasks) => {
      const i = tasks.findIndex((t) => t.id === task.id);
      if (i >= 0) tasks[i] = task; else tasks.push(task);
      return tasks;
    });
    return task;
  }

  // Base directory a locked-test path is recorded RELATIVE TO (#111). Normally the spine root, but
  // when the file lives inside a linked worktree (the sanctioned `chalk spec --test` re-lock is often
  // run from a task's worktree so the file exists at cwd), relativizing against `this.root` — the MAIN
  // checkout — yields a `../<worktree>/…` path that DIES the moment `chalk merge` cleans the worktree
  // up, ENOENT-ing every later integrity/break-it check even though the file exists on main. The
  // worktree's project root mirrors main by the same in-repo offset, so map main→worktree by that
  // offset and record tree-relative (e.g. `test/x.mjs`) — the form valid in EVERY checkout. Pure fs
  // (linkedWorktree), so store.mjs stays dependency-free.
  lockBase(fileDir) {
    const wt = linkedWorktree(fileDir);
    if (wt) {
      const offset = relative(wt.mainRoot, this.root); // project's path within the repo ('' unless a monorepo subdir)
      if (!offset.startsWith('..')) return resolve(wt.toplevel, offset);
    }
    return this.root;
  }

  // Lock a test file by hashing its current contents (P2/P6).
  lockTest(absPath) {
    if (!existsSync(absPath)) throw new Error(`Test file not found: ${absPath}`);
    return { path: relative(this.lockBase(dirname(absPath)), absPath), sha256: sha256(readFileSync(absPath)) };
  }
  // Returns list of tests whose on-disk hash no longer matches the lock (integrity break).
  // `root` is where the working copy lives (a task's worktree in the pipeline, else this.root).
  brokenLocks(task, root = this.root) {
    const broken = [];
    for (const t of task.tests || []) {
      const abs = join(root, t.path);
      const current = existsSync(abs) ? sha256(readFileSync(abs)) : null;
      if (current !== t.sha256) broken.push({ ...t, current });
    }
    return broken;
  }

  // --- append-only logs ---
  emitUpdate({ type = 'progress-update', title, description = '', phase, actorRole = 'agent', taskId }) {
    const evt = { id: id('evt'), at: now(), type, title, description, phase: phase ?? this.phase(), actorRole, taskId };
    appendFileSync(this.p.updates, JSON.stringify(evt) + '\n');
    return evt;
  }
  updates() {
    if (!existsSync(this.p.updates)) return [];
    return readFileSync(this.p.updates, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  appendDecision({ title, why = '', taskId }) {
    const stamp = now();
    const block = `\n## ${title}\n\n- _when:_ ${stamp}\n- _why:_ ${why || '(not given)'}\n`;
    appendFileSync(this.p.decisions, block);
    this.emitUpdate({ type: 'decision-logged', title: `Decision: ${title}`, description: why, ...(taskId ? { taskId } : {}) });
  }

  // --- director decisions: the DURABLE, compounding record of the director's accept/redirect calls
  // (#201). Distinct from `t.reviews[].decisions`, which is regenerated on every re-review (so an
  // accepted/redirected flag there does NOT persist) — this append-only JSONL survives for the life of
  // the project and is what feeds future context (#202, the moat). Git-tracked spine state. ---
  // `rationale` is always the AGENT's reason for the choice; `instruction` is the DIRECTOR's
  // course-correction (redirect only). Keeping them distinct matters downstream (#202): the compounding
  // feed says "apply this rationale" for an accepted call but "do this instead" for a redirected one.
  appendDirectorDecision({ choice, rationale = '', instruction = '', risk, taskId, verdict, by = 'human' }) {
    const rec = { at: now(), verdict, choice: String(choice || '').trim(), rationale: String(rationale || '').trim(),
      ...(instruction ? { instruction: String(instruction).trim() } : {}), ...(risk ? { risk } : {}), ...(taskId ? { taskId } : {}), by };
    appendFileSync(this.p.director, JSON.stringify(rec) + '\n');
    this.emitUpdate({ type: 'decision-logged', title: `Director ${verdict}: ${rec.choice || '(decision)'}`, description: instruction || rationale, ...(taskId ? { taskId } : {}) });
    return rec;
  }
  directorDecisions() {
    if (!existsSync(this.p.director)) return [];
    return readFileSync(this.p.director, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  // --- cost ledger: one record per BYO agent call. Wall-clock always; tokens/costUsd/turns when the
  // call went through a claude-shaped command (lib/cost.mjs harvests the -p json envelope) — old
  // ms-only records stay valid, and `chalk cost` degrades gracefully around them. ---
  logCost({ taskId, stage, agent, ms, tokens, costUsd, turns }) {
    try { mkdirSync(dirname(this.p.cost), { recursive: true }); appendFileSync(this.p.cost, JSON.stringify({ at: now(), taskId, stage, agent, ms, ...(tokens ? { tokens } : {}), ...(costUsd !== undefined ? { costUsd } : {}), ...(turns !== undefined ? { turns } : {}) }) + '\n'); }
    catch (e) {
      // Non-fatal, but not silent: an unwritable ledger means `chalk cost` under-reports. Warn once
      // per process — this fires on every agent call, and one broken disk shouldn't spam the run.
      if (!costWarned) { costWarned = true; console.error(`⚠ cost ledger write failed (${String(e.message || e).split('\n')[0]}) — chalk cost will under-report this run.`); }
    }
  }
  costRecords() {
    if (!existsSync(this.p.cost)) return [];
    return readFileSync(this.p.cost, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  // --- lessons (append-only memory injected into every agent's context) ---
  appendLesson({ lesson, by = 'retro' }) {
    appendFileSync(this.p.lessons, `- ${String(lesson).replace(/\s+/g, ' ').trim()}  _(${by}, ${now().slice(0, 10)})_\n`);
    this.emitUpdate({ type: 'lesson-learned', title: 'Lesson learned', description: String(lesson).slice(0, 200) });
  }
  // The most recent `n` lessons (each is one line), oldest→newest.
  lessons(n = LESSON_CAP) {
    if (!existsSync(this.p.lessons)) return [];
    return readFileSync(this.p.lessons, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).slice(-n);
  }

  // The durable decision log (.chalk/decisions.md); '' if the file is missing.
  decisions() { return existsSync(this.p.decisions) ? readFileSync(this.p.decisions, 'utf8') : ''; }

  // --- questions ---
  questions() { return readJSON(this.p.questions, []); }
  saveQuestions(q) { writeJSON(this.p.questions, q); }

  spec() { return existsSync(this.p.spec) ? readFileSync(this.p.spec, 'utf8') : ''; }
}

// The contract an agent operates under. Installed into AGENTS.md / CLAUDE.md so any CLI
// auto-loads it. Kept terse on purpose — agents read this every turn.
export const AGENT_GUIDE = `## Chalk Protocol — how to work in this repo

This project is driven by **Chalk Protocol**. Your job is to satisfy a locked spec, not to
declare victory. Use the \`chalk\` CLI as your loop. Run \`chalk next\` anytime to get your
next action.

**The loop (per task): read → work → verify → write.**

1. \`chalk next\` — find the one task to work on. Work on **ONE task at a time**.
2. \`chalk context <id>\` — read the acceptance criteria and the at-risk tests BEFORE coding.
   Do not work from memory.
3. \`chalk start <id>\` — begins the task. It refuses if the task has no acceptance criteria.
4. Write code to satisfy the criteria.
5. \`chalk verify\` — runs the real toolchain + a test-integrity check. Loop until it prints
   GREEN. **Do not self-declare success** — the gate decides, not you.
6. If review is required, \`chalk review <id>\` — an adversarial reviewer tries to refute your
   change. Fix every blocking finding and re-run until it passes. A green verify does NOT
   excuse an inadequate test or an unmet criterion.
7. \`chalk done <id>\` — only succeeds when verify is green, the locked tests are untouched,
   and (if required) the review passed.
8. Record what changed: \`chalk decision "..." --why "..."\`, \`chalk update "..."\`.

Queue work ahead with \`chalk task add "..." --milestone <m> --after <id>\`; \`chalk next\` and
\`chalk backlog\` honor the dependency order. \`chalk run\` drives this whole loop unattended when
an executor is configured (protocol.executor.command).

**Hard rules**
- Files listed under a task's tests are **READ-ONLY**. Do not edit, weaken, or delete them
  to make verify pass. To legitimately change a test, use
  \`chalk amend-spec <id> --test <path> --why "..."\` — that is the only sanctioned path.
- Never mark a task done by editing \`.chalk/tasks.json\` directly. Use \`chalk done\`.
- **Never read or edit anything under \`.chalk/held-out/\`** — the held-out regression set. If
  \`chalk audit\` reports a held-out failure, you are told only THAT a criterion regressed, not
  the assertion. Fix the bug against the spec; do not inspect or target the hidden tests.
- At phase boundaries run \`chalk audit\` — it must be green to advance.
- Keep diffs small and scoped to the current task.
- **When a task needs something only a human can supply** (credentials, a product decision, an
  upstream task, or other human input), do NOT stop. Run
  \`chalk block <id> --needs <creds|decision|human-input|upstream|review> --reason "..."\` and move on
  with \`chalk next\`. Only a fully blocked or empty queue ends the run.
- A \`needs review\` block is different: chalk's own adversarial reviewer blocked the change. It is
  YOURS to fix — address the findings, then re-run \`chalk review <id>\`; it is not a human dependency.`;

const CHALK_BEGIN = '<!-- chalk:begin (managed by \`chalk agents\` — edits inside are overwritten) -->';
const CHALK_END = '<!-- chalk:end -->';

// Write/refresh the managed Chalk block in a doc, preserving everything outside it.
function writeManagedBlock(file, body) {
  const block = `${CHALK_BEGIN}\n${body}\n${CHALK_END}`;
  let existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const b = existing.indexOf(CHALK_BEGIN);
  const e = existing.indexOf(CHALK_END);
  let next, action;
  if (b !== -1 && e !== -1) {
    next = existing.slice(0, b) + block + existing.slice(e + CHALK_END.length);
    action = 'updated';
  } else if (existing.trim()) {
    next = existing.replace(/\n*$/, '') + '\n\n' + block + '\n';
    action = 'appended to';
  } else {
    next = block + '\n';
    action = 'created';
  }
  writeFileSync(file, next);
  return action;
}

// ---- the DAG scheduler (shared by `next`, `backlog`, `chalk run`) ----
// Resolve a task ref (full id or 12-char prefix) against a list — mirrors Store.task().
export function resolveRef(tasks, ref) {
  return tasks.find((t) => t.id === ref) || tasks.find((t) => t.id.startsWith(ref));
}
// Are all of a task's `after` dependencies done?
export function depsSatisfied(task, tasks) {
  return (task.after || []).every((ref) => {
    const dep = resolveRef(tasks, ref);
    return dep && dep.state === 'done';
  });
}
// Where a task's code/gates run: its git worktree if it has one, else the primary root. The
// spine (tasks.json etc.) is ALWAYS read/written at store.root; only code edits + gates use this.
export function workdir(store, task) {
  return (task && task.worktree) || store.root;
}

// Tasks workable right now: specd (so P1 is satisfied), not blocked, all deps done. Array order.
// `todo` tasks lack acceptance criteria, so they are NOT auto-runnable — callers surface them separately.
// A task's unresolved director corrections (#200) — the rework it was re-opened to do.
export const pendingDirectives = (task) => (task.directives || []).filter((d) => d && !d.resolved);

export function runnableTasks(tasks) {
  // specd tasks are runnable; so is a RE-OPENED task (#200) — an in-progress task carrying an unresolved
  // director correction, which the driver must re-execute so the redirect actually gets reworked. A
  // normal in-progress task (no pending directive) is NOT re-picked, so ordinary work is unaffected.
  return tasks.filter((t) => (t.state === 'specd' || (t.state === 'in-progress' && pendingDirectives(t).length)) && depsSatisfied(t, tasks));
}

// The read-blob an agent (or the `chalk run` executor) gets before working a task: the spec
// slice, the task's acceptance criteria (the contract), at-risk locked tests, and the rules.
// Plain text on purpose — it is piped to a BYO executor on stdin, and printed by `chalk context`.
// Fit the lessons block into `remaining` bytes (#81). Lessons arrive oldest→newest; the budget is
// spent newest-first (recent lessons are the most relevant), so under pressure the OLDER ones are
// elided and a note says how many. Kept lessons still render chronologically. Returns null when
// there are no lessons at all. `remaining` ≤ 0 (task essentials already fill the budget) → all elided.
function fitLessonsBlock(lessons, remaining) {
  if (!lessons.length) return null;
  const heading = "## Lessons learned (don't repeat these)";
  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  const kept = [];
  let used = bytes(heading) + 1;
  for (let i = lessons.length - 1; i >= 0; i--) {
    const cost = bytes(lessons[i]) + 1;
    if (remaining > 0 && used + cost <= remaining) { kept.unshift(lessons[i]); used += cost; } else break;
  }
  const elided = lessons.length - kept.length;
  const note = elided ? `${kept.length ? '\n' : ''}  _(${elided} older lesson(s) elided to fit the context budget — raise protocol.contextBudget or run \`chalk archive\`)_` : '';
  return `${heading}\n${kept.join('\n')}${note}\n`;
}

export function buildContext(store, task) {
  const m = store.meta();
  const budget = Number(m.protocol?.contextBudget) > 0 ? Number(m.protocol.contextBudget) : DEFAULT_CONTEXT_BUDGET;
  const header = `# Chalk context — ${m.project.name} (phase: ${m.protocol?.phase})\n`;
  const specSection = `## Spec\n${store.spec().trim()}\n`;
  // Essential sections are NEVER dropped for budget — criteria, locked tests, handoff, prior review
  // findings, and the contract are the executor's actual instructions. Only the lessons block is
  // elastic (finding 6: lessons.md is the unbounded grower). Build essentials first, then spend the
  // leftover budget on lessons.
  const post = [];
  if (task) {
    post.push(`## Current task — ${task.title}  [${task.state}]\n`, '### Acceptance criteria (the contract — make these pass)');
    (task.acceptanceCriteria || []).forEach((c, i) => post.push(`  ${i + 1}. ${c.text}`));
    if (!(task.acceptanceCriteria || []).length) post.push('  (none yet — add with `chalk spec`)');
    if (task.plan) post.push(`\n### Plan (implement this — from the planning stage)\n${task.plan}`);
    post.push('\n### Tests at risk for this change (READ-ONLY — do not edit; use `chalk amend-spec`)');
    if ((task.tests || []).length) task.tests.forEach((x) => post.push(`  - ${x.path}`));
    else post.push('  (no locked tests)');
    // Resume from the prior session's handoff, if any — this is how one session picks up another's
    // work. Read task.handoff directly (no handoff.mjs import) to avoid a cycle; tolerate a missing file.
    if (task.handoff?.path) {
      try {
        const h = readFileSync(join(store.root, task.handoff.path), 'utf8').trim();
        if (h) post.push(`\n### Handoff from the prior session (resume this)\n${h}`);
      } catch { /* handoff doc gone — render the rest of the context anyway */ }
    }
    // If a prior review blocked, surface its findings so a re-run executor fixes exactly those.
    const lastReview = (task.reviews || []).slice(-1)[0];
    if (lastReview && lastReview.verdict === 'block' && (lastReview.findings || []).length) {
      post.push('\n### Address these review findings (a prior review blocked — fix them)');
      for (const f of lastReview.findings) post.push(`  - [${f.severity || '?'}/${f.area || '?'}] ${f.note || ''}`);
    }
    // Director corrections (#199): a human redirected an earlier judgment call — the executor must
    // REBUILD to these, not repeat the choice. Essential (never budget-dropped), like review findings.
    const directives = (task.directives || []).filter((x) => x && !x.resolved);
    if (directives.length) {
      post.push('\n### Director corrections (REBUILD to these — a human redirected your earlier call)');
      for (const dir of directives) post.push(`  - Instead of "${dir.choice || 'your earlier choice'}": ${dir.instead}`);
    }
  }
  const reg = m.protocol?.regression;
  if (reg?.tests?.length) post.push(`\n## Held-out regression\n${reg.tests.length} locked file(s) under ${reg.dir} — you may NOT read or edit them. They run in \`chalk audit\`; on failure you learn only WHICH criterion regressed. Fix against the spec.`);
  const openQ = store.questions().filter((q) => q.status !== 'resolved');
  if (openQ.length) { post.push('\n## Open questions'); openQ.forEach((q) => post.push(`  - ${q.question} (→ ${q.awaitingFrom})`)); }
  post.push('\n## Contract\nread → start (needs criteria) → work → `chalk verify` (must be green) → `chalk done`.\nTests are read-only. Do not self-declare done; the verify gate decides.');

  const essentialBytes = Buffer.byteLength([header, specSection, ...post].join('\n'), 'utf8');
  const lessonsBlock = fitLessonsBlock(store.lessons(), budget - essentialBytes);
  return [header, specSection, ...(lessonsBlock ? [lessonsBlock] : []), ...post].join('\n');
}

// Install the agent contract into AGENTS.md and CLAUDE.md at the project root.
export function installAgentDocs(root) {
  return ['AGENTS.md', 'CLAUDE.md'].map((name) => ({ name, action: writeManagedBlock(join(root, name), AGENT_GUIDE) }));
}

// Scaffold a fresh spine. Returns the created meta. A `preset` fills stack-appropriate verify/
// regression defaults; `runner` is the SDK prefix (e.g. "fvm") applied to every gate command.
export function initSpine(root, { name, goal, preset, runner, executor }) {
  const base = join(root, '.chalk');
  if (existsSync(join(base, 'chalk.json'))) throw new Error(`.chalk/ already exists at ${base}`);
  mkdirSync(base, { recursive: true });
  const meta = {
    // Canonical chalk.json fields (conform to chalk.schema.json: version + project.name).
    version: SCHEMA_VERSION,
    // The chalk-protocol version that last wrote this spine — for version-skew detection (#159).
    writerVersion: CHALK_VERSION,
    project: { name: name || 'untitled', description: goal || '' },
    // All Chalk Protocol config nested under one key so the top level stays canonical-clean.
    protocol: {
      version: PROTOCOL,
      phase: 'discovery',
      status: 'active',
      runner: '', // SDK prefix applied to every gate command (e.g. "fvm")
      verify: { test: '', typecheck: '', lint: '', build: '' },
      review: { command: '', requiredAt: [] }, // P5: BYO adversarial reviewer; reads prompt on stdin, prints JSON verdict (legacy `required: true` still honored)
      // P7: held-out set, hidden from the implementer. chalk hides it from `chalk context`, but a
      // worktree is a plain `git checkout` — so if you COMMIT `.chalk/held-out/`, it will physically
      // appear in the worktree sandbox where the implementer could read it. RECOMMENDED: gitignore
      // `.chalk/held-out/` so the hidden set lives only in the main checkout (audit runs there).
      regression: { command: '', authorCommand: '', dir: '.chalk/held-out', required: false, tests: [], locPerTest: 2000, lastAudit: null },
      planner: { command: '' }, // optional planning stage: read-only agent that emits a plan the executor implements
      // Plan-approval gate (the human checkpoint). When required, `work` won't run until a human has
      // run `chalk approve-plan` (after answering the planner's scoping questions). Opt-in (default off).
      plan: { required: false },
      // Director-mode alignment gate (#191). When required, `work` won't build until a human has run
      // `chalk align <id>` to accept the acceptance criteria as the definition of *done* — the empty-middle
      // checkpoint from #160 (an autonomous run building everything, then finding it misaligned). Opt-in
      // (default off), so existing/unattended flows are unaffected.
      director: { required: false },
      executor: { command: '' }, // P0 #2: BYO unattended executor for `chalk run`; receives `chalk context` on stdin
      // Test-enforcement gate: a feature change (has acceptance criteria; not a docs/chore/refactor
      // branch; not labeled skip-test) must add or change a test, else `work` blocks. Stops a vacuously
      // green verify from merging an untested feature. Set false to disable.
      requireTest: true,
      // Byte budget for the `chalk context` blob injected into the executor (#81). Generous default;
      // only the elastic lessons block is trimmed to fit (oldest elided with a note) — the task's
      // criteria/tests/handoff/contract are always kept. Raise it, or run `chalk archive`, if lessons
      // are being elided on a large project.
      contextBudget: 65536,
      // Locked-test integrity scope (#80). 'in-progress' (default): verify hashes only the current
      // in-progress tasks' locked tests — lock protection expires at `done`. 'all-locks': verify
      // also hashes every DONE task's locked tests, so a later task can't weaken an earlier task's
      // contract to keep its own verify green. `amend-spec` stays the sanctioned change path;
      // legitimate evolution of an old locked test then requires an amend on that task.
      integrity: 'in-progress',
      // Tamper-evidence (#80's sibling, manual-mode hardening). When true, chalk records the hashes
      // of its authority files (chalk.json, tasks.json) after every write and loudly flags — on the
      // next invocation — any change made OUTSIDE chalk (hand-marking a task done, weakening a verify
      // command). Evidence, not a lock. Default false.
      tamperEvident: false,
      // Lever 3 — the break-it / non-vacuity gate. A per-file test command template (e.g.
      // "node --test {test}", "pytest {test}") used to run a locked test against the reverted
      // implementation: a test that still passes there asserts nothing and blocks. Empty → OFF.
      breakTest: '',
      // Mutation-testing adequacy gate (rigorous lever 3): a per-file command template (e.g.
      // "npx stryker run --mutate {file}", "cargo mutants --file {file}", "mutmut run --paths-to-mutate
      // {file}") that exits non-zero when mutants SURVIVE in the changed code — proving the tests don't pin
      // it (line coverage can be 100% with a near-zero mutation score). Empty → OFF.
      mutation: '',
      // Handoff docs — written when a task can't finish in its session (block, manual, or churn past
      // maxAttempts) so a FRESH session picks it up (one session per task). `command` is an optional
      // BYO agent that enriches the narrative; empty → template only. maxAttempts caps churn.
      handoff: { command: '', maxAttempts: 3 },
      // PR "what was done" recording. `chalk pr` writes summary + narrative + changed files + criteria
      // into the PR body; an optional BYO `command` authors the narrative (empty → structured template).
      prbody: { command: '' },
      // GitHub issue→merge pipeline (BYO gh CLI + git worktree).
      github: { command: 'gh', base: 'main', repo: '', deployBase: 'main', mergeMethod: 'squash', labelType: { bug: 'fix', enhancement: 'feat', documentation: 'docs' }, ciPollIntervalMs: 5000, ciPollAttempts: 24 },
      // worktrees created at <dir>/<repo>-<branch-slug>. The spine is single-canonical: commands run
      // from a worktree resolve to the MAIN checkout's .chalk (findRoot), so no state is copied in.
      // `setup` = a bootstrap command (pub get / npm ci) run once in the worktree before work/verify.
      worktree: { enabled: true, dir: '..', setup: '' },
      // powers the test+screenshot stage. specPattern (#83) selects which locked paths are browser
      // specs (suffix / comma-list / array; leading `*` ok); empty → the historical `.test.yaml`.
      e2e: { command: '', baseUrl: '', runsDir: '.chalk/runs', specPattern: '.test.yaml' },
      retro: { command: '' }, // self-healing: read-only agent → durable lessons + improvement issues
      // Feedback loop: a read-only agent reads external product signals (.chalk/feedback/) → improvement
      // issues filed to the backlog. Closes the cycle ship→learn→improve. Empty → `chalk feedback` off.
      feedback: { command: '' },
      // Discovery / intake: a read-only agent turns a product brief into a scoped backlog (tasks +
      // acceptance criteria) via `chalk discover`. The front door of the loop. Empty → off.
      discovery: { command: '' },
      // Stakeholder portal: `chalk portal` writes client-facing portal data (scope/milestones/updates)
      // derived from the spine into <dir>/ (the Chalk Projects portal `.project/` layout).
      portal: { dir: '.project' },
      // Opt-in anonymous activation telemetry (#154): funnel milestones only (init → first green verify →
      // first done) + version + a random install id. OFF by default; prompted once at init; hard-disabled
      // by CHALK_TELEMETRY=0 and on CI. See lib/telemetry.mjs for the exact (whitelisted) payload.
      telemetry: { enabled: false, endpoint: '' },
    },
    createdAt: now(),
    updatedAt: now(),
  };
  const p = preset && PRESETS[preset];
  if (p) {
    Object.assign(meta.protocol.verify, p.verify || {});
    Object.assign(meta.protocol.regression, p.regression || {});
    if (p.breakTest) meta.protocol.breakTest = p.breakTest; // non-vacuity lever ON by default per stack
  }
  if (runner) meta.protocol.runner = runner;
  // --executor opencode: wire the BYO executor to this repo's bundled opencode-exec adapter via an
  // ABSOLUTE path (resolved from this module, not cwd) so it works when chalk is linked/installed
  // and `chalk run` executes from an arbitrary project root. After the preset block, so it sticks.
  if (executor === 'opencode') {
    const adapter = fileURLToPath(new URL('../bin/adapters/opencode-exec.mjs', import.meta.url));
    meta.protocol.executor.command = `node ${adapter}`;
  }
  // --executor claude: the full Claude Code wiring this repo dogfoods — executor/planner/retro
  // commands plus a REQUIRED per-task adversarial review (an executor without an adversary isn't
  // the protocol). The agent .md files those commands name are installed by the init command.
  if (executor === 'claude') {
    meta.protocol.executor.command = CLAUDE_COMMANDS.executor;
    meta.protocol.planner.command = CLAUDE_COMMANDS.planner;
    meta.protocol.retro.command = CLAUDE_COMMANDS.retro;
    // Extend, don't replace: keeps the default shape (required:false) consistent across init paths.
    meta.protocol.review = { ...meta.protocol.review, command: CLAUDE_COMMANDS.review, requiredAt: ['per-task'] };
  }
  writeJSON(join(base, 'chalk.json'), meta);
  writeJSON(join(base, 'tasks.json'), []);
  writeJSON(join(base, 'questions.json'), []);
  writeFileSync(join(base, 'spec.md'), `# ${meta.project.name} — spec\n\n${goal ? `> ${goal}\n` : ''}\n_What we're building, the boundaries, and the durable decisions. Human + agent authored._\n`);
  writeFileSync(join(base, 'decisions.md'), `# Decisions (ADR-lite)\n`);
  writeFileSync(join(base, 'lessons.md'), `# Lessons learned\n\n<!-- Append-only memory injected into every agent's context. Added by \`chalk lesson\` / \`chalk retro\`. -->\n`);
  writeFileSync(join(base, 'updates.jsonl'), '');
  mkdirSync(join(base, 'held-out'), { recursive: true }); // P7: held-out regression set (off-limits to the implementer)
  writeFileSync(join(base, 'held-out', 'README.md'), `# Held-out regression set\n\nImplementing agents must NOT read or edit anything here. Authored from the spec via\n\`chalk guard\`, run via \`chalk audit\` (results withheld). This is the oversight the visible\ntest suite can't provide once it becomes the optimization target.\n`);
  return meta;
}
