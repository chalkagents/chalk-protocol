// Context budget (#81, harness-review finding 6). `buildContext` injected spec + criteria + lessons
// + handoff with no size cap; lessons.md grows forever, so large/old projects degrade the executor
// silently (or hit stdin limits). Now `protocol.contextBudget` (bytes, generous default) trims ONLY
// the elastic lessons block to fit: the task's criteria, locked tests, handoff, and the contract are
// always kept, and under pressure the OLDEST lessons are elided first (recent kept) with a note
// reporting how many. This suite pins: a tiny budget elides older lessons (note + newest survive)
// while every essential section stays, and a generous/default budget keeps all lessons. Locked
// contract for the task tracking issue #81.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

// A spine with a task carrying a locked test + criteria, plus several distinctly-worded lessons
// (oldest → newest: L0 … L5). Each lesson line is padded so a small byte budget forces eliding.
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-ctxbudget-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'acc.test.mjs'), "import {test} from 'node:test'; test('t',()=>{});\n");
  chalk(d, 'task', 'add', 'BuildFeature');
  const id = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', id, '--criterion', 'UNIQUE_CRITERION_TEXT', '--test', 'acc.test.mjs');
  chalk(d, 'start', id);
  for (let i = 0; i < 6; i++) chalk(d, 'lesson', 'add', `LESSON_${i} ` + 'x'.repeat(200));
  return { d, id };
}

test('tiny budget — older lessons are elided (note + newest kept); every essential section survives', () => {
  const { d, id } = repo();
  conf(d, (o) => { o.contextBudget = 900; }); // smaller than the essentials + all lessons
  const r = chalk(d, 'context', id);
  assert.equal(r.code, 0, r.out);
  // Essentials are never dropped for budget.
  assert.match(r.out, /UNIQUE_CRITERION_TEXT/, 'criteria survive');
  assert.match(r.out, /acc\.test\.mjs/, 'locked test survives');
  assert.match(r.out, /## Contract/, 'the contract survives');
  // Lessons are trimmed: an elision note appears, the OLDEST (LESSON_0) is gone, the NEWEST (LESSON_5) stays.
  assert.match(r.out, /older lesson\(s\) elided to fit the context budget/i, 'the elision note is present');
  assert.doesNotMatch(r.out, /LESSON_0\b/, 'the oldest lesson is elided first');
  assert.match(r.out, /LESSON_5\b/, 'the most-recent lesson is kept');
});

test('generous budget — all lessons are kept and no elision note appears', () => {
  const { d, id } = repo();
  conf(d, (o) => { o.contextBudget = 200000; });
  const r = chalk(d, 'context', id);
  assert.equal(r.code, 0, r.out);
  for (let i = 0; i < 6; i++) assert.match(r.out, new RegExp(`LESSON_${i}\\b`), `LESSON_${i} kept under a generous budget`);
  assert.doesNotMatch(r.out, /older lesson\(s\) elided/i, 'no elision note when everything fits');
});

test('default (unset) budget keeps all lessons for a normal-sized project', () => {
  const { d, id } = repo();
  // No contextBudget set → DEFAULT_CONTEXT_BUDGET (65536) — comfortably fits a handful of lessons.
  const r = chalk(d, 'context', id);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /LESSON_0\b/, 'unset budget uses the generous default — nothing elided');
  assert.doesNotMatch(r.out, /older lesson\(s\) elided/i);
});

test('budget so small only essentials fit — all lessons elided, note still shown, contract intact', () => {
  const { d, id } = repo();
  conf(d, (o) => { o.contextBudget = 1; });
  const r = chalk(d, 'context', id);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /UNIQUE_CRITERION_TEXT/, 'criteria never sacrificed even at budget 1');
  assert.match(r.out, /## Contract/, 'contract never sacrificed');
  assert.match(r.out, /6 older lesson\(s\) elided/i, 'all six lessons elided, count reported');
  assert.doesNotMatch(r.out, /LESSON_5\b/, 'no lesson body survives when nothing fits');
});
