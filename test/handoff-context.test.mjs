// Handoff RESUME — the consumption side. A handoff is only useful if the next session reads it, so
// buildContext (printed by `chalk context`) folds in the latest handoff doc, and `chalk next --json`
// emits the fresh-session signal an orchestrator uses to start one session per task. Covers the
// resume section, tolerance of a missing handoff file, the JSON shape/selection, and that the plain
// (human) `chalk next` output is unchanged.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'handoff-ctx-'));
const task0 = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'))[0];
const tid = (d) => task0(d).id.slice(0, 12);
const lastJson = (r) => JSON.parse(r.stdout.trim().split('\n').pop());

test('buildContext — `chalk context` folds in the latest handoff so a fresh session resumes', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  chalk(d, 'handoff', a, '--note', 'RESUME-MARKER-42');
  const ctx = chalk(d, 'context', a);
  assert.equal(ctx.code, 0);
  assert.match(ctx.out, /Handoff from the prior session/, 'the resume section is present');
  assert.match(ctx.out, /RESUME-MARKER-42/, 'the handoff doc content is included');
});

test('buildContext — a missing handoff file is tolerated (no crash)', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  chalk(d, 'handoff', a);
  rmSync(join(d, task0(d).handoff.path)); // delete the doc but leave the pointer on the task
  const ctx = chalk(d, 'context', a);
  assert.equal(ctx.code, 0, 'context still renders');
  assert.match(ctx.out, /Current task — T/, 'the rest of the context is intact');
  assert.doesNotMatch(ctx.out, /Handoff from the prior session/, 'no resume section when the file is gone');
});

test('chalk next --json — emits the fresh-session signal: in-progress→work with its handoff path', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x'); chalk(d, 'start', a);
  chalk(d, 'handoff', a, '--note', 'n');
  const j = lastJson(chalk(d, 'next', '--json'));
  assert.equal(j.freshSession, true, 'always recommends a fresh session');
  assert.equal(j.task.id, task0(d).id);
  assert.equal(j.task.state, 'in-progress');
  assert.equal(j.action, 'work', 'in-progress → work');
  assert.equal(j.handoff, task0(d).handoff.path, 'carries the latest handoff path');
});

test('chalk next --json — a specd task → start/null handoff; no tasks → null task', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  // empty backlog
  const empty = lastJson(chalk(d, 'next', '--json'));
  assert.deepEqual(empty, { task: null, freshSession: true, handoff: null, action: null });
  // a specd (not started) task → action 'start', no handoff
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x');
  const j = lastJson(chalk(d, 'next', '--json'));
  assert.equal(j.task.state, 'specd');
  assert.equal(j.action, 'start');
  assert.equal(j.handoff, null);
});

test('chalk next (plain) — output is unchanged human format, not JSON', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'd');
  chalk(d, 'task', 'add', 'T'); const a = tid(d);
  chalk(d, 'spec', a, '--criterion', 'x');
  const r = chalk(d, 'next');
  assert.match(r.out, /Chalk · next action/, 'human header present');
  assert.equal(r.stdout.trim().startsWith('{'), false, 'not JSON without --json');
});
