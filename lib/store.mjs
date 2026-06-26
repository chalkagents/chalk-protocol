// Chalk Protocol — spine store. Reads/writes the .chalk/ directory.
// Zero dependencies. The spine is the product; this module is its only writer.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { PRESETS } from './config.mjs';

export const PROTOCOL = 'chalk/0';
export const PHASES = ['discovery', 'spec', 'design', 'build', 'review', 'ship'];
export const TASK_STATES = ['todo', 'specd', 'in-progress', 'blocked', 'done'];
// What a blocked task is waiting on — only a human can supply these.
export const NEEDS = ['creds', 'decision', 'human-input', 'upstream'];

// Portal-compatible update-type vocabulary (subset we emit from code).
export const UPDATE_TYPES = [
  'progress-update', 'milestone-hit', 'decision-logged', 'lesson-learned', 'planning-generated',
  'work-item-started', 'work-item-submitted', 'work-item-accepted', 'question-answered',
];

// How many of the most-recent lessons are injected into an agent's context. `chalk lesson list`
// mirrors this cap so the listed lessons are exactly the set agents actually see (use --all for full history).
export const LESSON_CAP = 15;

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
    questions: join(base, 'questions.json'),
  };
};

const readJSON = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJSON = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

export class Store {
  constructor(root) {
    this.root = root;
    this.p = paths(root);
  }

  static open() { return new Store(requireRoot()); }

  // --- meta (chalk.json) ---
  meta() { return readJSON(this.p.chalk, null); }
  saveMeta(meta) {
    meta.updatedAt = now();
    writeJSON(this.p.chalk, meta);
    return meta;
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
  saveTasks(tasks) { writeJSON(this.p.tasks, tasks); }
  task(idOrPrefix) {
    const tasks = this.tasks();
    return tasks.find((t) => t.id === idOrPrefix)
      || tasks.find((t) => t.id.startsWith(idOrPrefix));
  }
  upsertTask(task) {
    const tasks = this.tasks();
    const i = tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) tasks[i] = task; else tasks.push(task);
    this.saveTasks(tasks);
    return task;
  }

  // Lock a test file by hashing its current contents (P2/P6).
  lockTest(absPath) {
    if (!existsSync(absPath)) throw new Error(`Test file not found: ${absPath}`);
    return { path: relative(this.root, absPath), sha256: sha256(readFileSync(absPath)) };
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
  appendDecision({ title, why = '' }) {
    const stamp = now();
    const block = `\n## ${title}\n\n- _when:_ ${stamp}\n- _why:_ ${why || '(not given)'}\n`;
    appendFileSync(this.p.decisions, block);
    this.emitUpdate({ type: 'decision-logged', title: `Decision: ${title}`, description: why });
  }

  // --- cost ledger: one record per BYO agent call, for visibility (subscription = flat cost +
  // rate-capped, so calls + wall-clock are the practical proxy; API = per-token via the Console). ---
  logCost({ taskId, stage, agent, ms }) {
    try { mkdirSync(dirname(this.p.cost), { recursive: true }); appendFileSync(this.p.cost, JSON.stringify({ at: now(), taskId, stage, agent, ms }) + '\n'); } catch { /* non-fatal */ }
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
  \`chalk block <id> --needs <creds|decision|human-input|upstream> --reason "..."\` and move on
  with \`chalk next\`. Only a fully blocked or empty queue ends the run.`;

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
export function runnableTasks(tasks) {
  return tasks.filter((t) => t.state === 'specd' && depsSatisfied(t, tasks));
}

// The read-blob an agent (or the `chalk run` executor) gets before working a task: the spec
// slice, the task's acceptance criteria (the contract), at-risk locked tests, and the rules.
// Plain text on purpose — it is piped to a BYO executor on stdin, and printed by `chalk context`.
export function buildContext(store, task) {
  const m = store.meta();
  const out = [`# Chalk context — ${m.project.name} (phase: ${m.protocol?.phase})\n`, `## Spec\n${store.spec().trim()}\n`];
  const lessons = store.lessons();
  if (lessons.length) out.push(`## Lessons learned (don't repeat these)\n${lessons.join('\n')}\n`);
  if (task) {
    out.push(`## Current task — ${task.title}  [${task.state}]\n`, '### Acceptance criteria (the contract — make these pass)');
    (task.acceptanceCriteria || []).forEach((c, i) => out.push(`  ${i + 1}. ${c.text}`));
    if (!(task.acceptanceCriteria || []).length) out.push('  (none yet — add with `chalk spec`)');
    if (task.plan) out.push(`\n### Plan (implement this — from the planning stage)\n${task.plan}`);
    out.push('\n### Tests at risk for this change (READ-ONLY — do not edit; use `chalk amend-spec`)');
    if ((task.tests || []).length) task.tests.forEach((x) => out.push(`  - ${x.path}`));
    else out.push('  (no locked tests)');
  }
  const reg = m.protocol?.regression;
  if (reg?.tests?.length) out.push(`\n## Held-out regression\n${reg.tests.length} locked file(s) under ${reg.dir} — you may NOT read or edit them. They run in \`chalk audit\`; on failure you learn only WHICH criterion regressed. Fix against the spec.`);
  const openQ = store.questions().filter((q) => q.status !== 'resolved');
  if (openQ.length) { out.push('\n## Open questions'); openQ.forEach((q) => out.push(`  - ${q.question} (→ ${q.awaitingFrom})`)); }
  out.push('\n## Contract\nread → start (needs criteria) → work → `chalk verify` (must be green) → `chalk done`.\nTests are read-only. Do not self-declare done; the verify gate decides.');
  return out.join('\n');
}

// Install the agent contract into AGENTS.md and CLAUDE.md at the project root.
export function installAgentDocs(root) {
  return ['AGENTS.md', 'CLAUDE.md'].map((name) => ({ name, action: writeManagedBlock(join(root, name), AGENT_GUIDE) }));
}

// Scaffold a fresh spine. Returns the created meta. A `preset` fills stack-appropriate verify/
// regression defaults; `runner` is the SDK prefix (e.g. "fvm") applied to every gate command.
export function initSpine(root, { name, goal, preset, runner }) {
  const base = join(root, '.chalk');
  if (existsSync(join(base, 'chalk.json'))) throw new Error(`.chalk/ already exists at ${base}`);
  mkdirSync(base, { recursive: true });
  const meta = {
    // Canonical chalk.json fields (conform to chalk.schema.json: version + project.name).
    version: '1.0',
    project: { name: name || 'untitled', description: goal || '' },
    // All Chalk Protocol config nested under one key so the top level stays canonical-clean.
    protocol: {
      version: PROTOCOL,
      phase: 'discovery',
      status: 'active',
      runner: '', // SDK prefix applied to every gate command (e.g. "fvm")
      verify: { test: '', typecheck: '', lint: '', build: '' },
      review: { command: '', required: false }, // P5: BYO adversarial reviewer; reads prompt on stdin, prints JSON verdict
      // P7: held-out set, hidden from the implementer. chalk hides it from `chalk context`, but a
      // worktree is a plain `git checkout` — so if you COMMIT `.chalk/held-out/`, it will physically
      // appear in the worktree sandbox where the implementer could read it. RECOMMENDED: gitignore
      // `.chalk/held-out/` so the hidden set lives only in the main checkout (audit runs there).
      regression: { command: '', authorCommand: '', dir: '.chalk/held-out', required: false, tests: [], lastAudit: null },
      planner: { command: '' }, // optional planning stage: read-only agent that emits a plan the executor implements
      executor: { command: '' }, // P0 #2: BYO unattended executor for `chalk run`; receives `chalk context` on stdin
      // GitHub issue→merge pipeline (BYO gh CLI + git worktree).
      github: { command: 'gh', base: 'main', repo: '', mergeMethod: 'squash', labelType: { bug: 'fix', enhancement: 'feat', documentation: 'docs' } },
      // worktrees created at <dir>/<repo>-<branch-slug>. The spine is single-canonical: commands run
      // from a worktree resolve to the MAIN checkout's .chalk (findRoot), so no state is copied in.
      // `setup` = a bootstrap command (pub get / npm ci) run once in the worktree before work/verify.
      worktree: { enabled: true, dir: '..', setup: '' },
      e2e: { command: '', baseUrl: '', runsDir: '.chalk/runs' }, // powers the test+screenshot stage
      retro: { command: '' }, // self-healing: read-only agent → durable lessons + improvement issues
    },
    createdAt: now(),
    updatedAt: now(),
  };
  const p = preset && PRESETS[preset];
  if (p) {
    Object.assign(meta.protocol.verify, p.verify || {});
    Object.assign(meta.protocol.regression, p.regression || {});
  }
  if (runner) meta.protocol.runner = runner;
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
