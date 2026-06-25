// Chalk Protocol — spine store. Reads/writes the .chalk/ directory.
// Zero dependencies. The spine is the product; this module is its only writer.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

export const PROTOCOL = 'chalk/0';
export const PHASES = ['discovery', 'spec', 'design', 'build', 'review', 'ship'];
export const TASK_STATES = ['todo', 'specd', 'in-progress', 'blocked', 'done'];
// What a blocked task is waiting on — only a human can supply these.
export const NEEDS = ['creds', 'decision', 'human-input', 'upstream'];

// Portal-compatible update-type vocabulary (subset we emit from code).
export const UPDATE_TYPES = [
  'progress-update', 'milestone-hit', 'decision-logged',
  'work-item-started', 'work-item-submitted', 'work-item-accepted', 'question-answered',
];

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Walk up from `start` to find an existing .chalk/ dir. Returns its parent (project root).
export function findRoot(start = process.cwd()) {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, '.chalk', 'chalk.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
  brokenLocks(task) {
    const broken = [];
    for (const t of task.tests || []) {
      const abs = join(this.root, t.path);
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
8. Record what changed: \`chalk decision "..." --why "..."\`, \`chalk update "..."\`,
   \`chalk question add "..."\` for anything needing a human.

**Hard rules**
- Files listed under a task's tests are **READ-ONLY**. Do not edit, weaken, or delete them
  to make verify pass. To legitimately change a test, use
  \`chalk amend-spec <id> --test <path> --why "..."\` — that is the only sanctioned path.
- Never mark a task done by editing \`.chalk/tasks.json\` directly. Use \`chalk done\`.
- **Never read or edit anything under \`.chalk/held-out/\`** — the held-out regression set. If
  \`chalk audit\` reports a held-out failure, you are told only THAT a criterion regressed, not
  the assertion. Fix the bug against the spec; do not inspect or target the hidden tests.
- At phase boundaries run \`chalk audit\` — it must be green to advance.
- Keep diffs small and scoped to the current task.`;

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
// Tasks workable right now: specd (so P1 is satisfied), not blocked, all deps done. Array order.
// `todo` tasks lack acceptance criteria, so they are NOT auto-runnable — callers surface them separately.
export function runnableTasks(tasks) {
  return tasks.filter((t) => t.state === 'specd' && depsSatisfied(t, tasks));
}

// Install the agent contract into AGENTS.md and CLAUDE.md at the project root.
export function installAgentDocs(root) {
  return ['AGENTS.md', 'CLAUDE.md'].map((name) => ({ name, action: writeManagedBlock(join(root, name), AGENT_GUIDE) }));
}

// Scaffold a fresh spine. Returns the created meta.
export function initSpine(root, { name, goal }) {
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
      verify: { test: '', typecheck: '', lint: '', build: '' },
      review: { command: '', required: false }, // P5: BYO adversarial reviewer; reads prompt on stdin, prints JSON verdict
      regression: { command: '', authorCommand: '', dir: '.chalk/held-out', required: false, tests: [], lastAudit: null }, // P7: held-out set, hidden from the implementer
    },
    createdAt: now(),
    updatedAt: now(),
  };
  writeJSON(join(base, 'chalk.json'), meta);
  writeJSON(join(base, 'tasks.json'), []);
  writeJSON(join(base, 'questions.json'), []);
  writeFileSync(join(base, 'spec.md'), `# ${meta.project.name} — spec\n\n${goal ? `> ${goal}\n` : ''}\n_What we're building, the boundaries, and the durable decisions. Human + agent authored._\n`);
  writeFileSync(join(base, 'decisions.md'), `# Decisions (ADR-lite)\n`);
  writeFileSync(join(base, 'updates.jsonl'), '');
  mkdirSync(join(base, 'held-out'), { recursive: true }); // P7: held-out regression set (off-limits to the implementer)
  writeFileSync(join(base, 'held-out', 'README.md'), `# Held-out regression set\n\nImplementing agents must NOT read or edit anything here. Authored from the spec via\n\`chalk guard\`, run via \`chalk audit\` (results withheld). This is the oversight the visible\ntest suite can't provide once it becomes the optimization target.\n`);
  return meta;
}
