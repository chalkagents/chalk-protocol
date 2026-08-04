// Human next/doctor views prioritize action without changing machine output, keep complete verbose
// detail, describe provider-neutral readiness, validate manual mode, and never invoke an agent.
import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { doctorResultGroups, nextActionView } from '../lib/action-views.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-action-view-'));
const strip = (value) => String(value).replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, args, env = process.env) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
  return { code: result.status, raw: `${result.stdout || ''}${result.stderr || ''}`, out: strip(`${result.stdout || ''}${result.stderr || ''}`) };
};
const task = (id, title, state, extra = {}) => ({ id, title, state, acceptanceCriteria: [], tests: [], after: [], ...extra });

function mixedTasks() {
  return [
    task('task-blocked-duplicate', 'duplicate already shipped', 'blocked', { block: { needs: 'decision', reason: 'duplicate of closed issue' } }),
    task('task-human-credentials', 'publish provider package', 'blocked', { block: { needs: 'creds', reason: 'needs registry token' } }),
    task('task-upstream-block', 'upstream dependency', 'blocked', { block: { needs: 'upstream', reason: 'waiting for upstream' } }),
    task('task-needs-criteria', 'windows lane', 'todo'),
    task('task-waiting-dependency', 'dependent cleanup', 'specd', { acceptanceCriteria: [{ text: 'cleanup works' }], after: ['task-upstream-block'] }),
    task('task-useful-ready', 'useful runnable action', 'specd', { acceptanceCriteria: [{ text: 'useful works' }] }),
    task('task-old-done', 'old completed work', 'done'),
  ];
}

function initialized(tasks = mixedTasks()) {
  const root = scratch();
  assert.equal(chalk(root, ['init', '--bare', '--executor', 'none', '--no-agents', '--no-telemetry']).code, 0);
  writeFileSync(join(root, '.chalk', 'tasks.json'), JSON.stringify(tasks, null, 2));
  return root;
}

test('mixed Chalk-like queue chooses one useful command and summarizes every remaining category', () => {
  const view = nextActionView(mixedTasks());
  assert.equal(view.primary.task.id, 'task-useful-ready');
  assert.equal(view.primary.command, 'chalk start task-useful-');
  assert.deepEqual(view.counts, {
    inProgress: 0, runnable: 1, reviewBlocked: 0, blocked: 3,
    humanInput: 3, needsCriteria: 1, dependencies: 1, done: 1,
  });

  const root = initialized();
  const concise = chalk(root, ['next']);
  assert.equal((concise.out.match(/\bNEXT\b/g) || []).length, 1, concise.out);
  assert.match(concise.out, /NEXT Start: useful runnable action chalk start task-useful-/);
  assert.ok(concise.out.indexOf('useful runnable action') < concise.out.indexOf('Queue summary'), 'useful action appears first');
  assert.match(concise.out, /needs criteria 1/);
  assert.match(concise.out, /waiting on dependencies 1/);
  assert.match(concise.out, /blocked 3 \(human input 3 · review rework 0\)/);
  assert.doesNotMatch(concise.out, /duplicate already shipped|needs registry token/, 'default does not become a wall of blocked detail');
});

test('next --verbose reveals the complete mixed listing while next --json stays exactly stable', () => {
  const root = initialized();
  const verbose = chalk(root, ['next', '--verbose']);
  for (const visible of [
    'duplicate already shipped', 'publish provider package', 'upstream dependency', 'windows lane',
    'dependent cleanup', 'useful runnable action', 'old completed work',
  ]) assert.match(verbose.out, new RegExp(visible), `${visible} missing from verbose output`);
  assert.match(verbose.out, /needs decision \(duplicate of closed issue\)/);
  assert.match(verbose.out, /waiting: dependent cleanup — on upstream dependency/);
  assert.match(verbose.out, /chalk spec task-needs-c --criterion/);

  const json = chalk(root, ['next', '--json']);
  assert.deepEqual(JSON.parse(json.out), {
    task: { id: 'task-useful-ready', title: 'useful runnable action', state: 'specd' },
    freshSession: true, handoff: null, action: 'start',
  });
});

test('doctor human output is ordered by severity and reports profile capabilities plus independence', () => {
  assert.deepEqual(doctorResultGroups([
    { level: 'info' }, { level: 'warn' }, { level: 'fail' }, { level: 'ok' },
  ]).map((group) => [group.title, group.items.length]), [
    ['Blockers', 1], ['Warnings', 1], ['Optional improvements', 1],
  ]);

  const root = initialized([]);
  const file = join(root, '.chalk', 'chalk.json');
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  const caps = { roles: ['executor', 'reviewer'], access: ['read-only', 'workspace-write'], output: ['text', 'json'] };
  meta.protocol.agents = {
    version: 1,
    profiles: {
      builder: { adapter: 'codex', command: 'must-not-run', identity: { displayName: 'Builder', independenceKey: 'family-a' }, capabilities: caps, options: {} },
      reviewer: { adapter: 'gemini', command: 'must-not-run', identity: { displayName: 'Reviewer', independenceKey: 'family-b' }, capabilities: caps, options: {} },
    },
    roles: { executor: 'builder', reviewer: 'reviewer' },
  };
  writeFileSync(file, JSON.stringify(meta, null, 2));
  const doctor = chalk(root, ['doctor']);
  const blockers = doctor.out.indexOf('Blockers');
  const warnings = doctor.out.indexOf('Warnings');
  const improvements = doctor.out.indexOf('Optional improvements');
  assert.ok(blockers >= 0 && blockers < warnings && warnings < improvements, doctor.out);
  assert.match(doctor.out, /Agent readiness/);
  assert.match(doctor.out, /executor → builder \(codex\) · access \["read-only","workspace-write"\] · output \["text","json"\]/);
  assert.match(doctor.out, /reviewer → reviewer \(gemini\)/);
  assert.match(doctor.out, /reviewer independence: distinct/);
});

test('manual mode is a valid path, remediation is exact, and JSON retains its stable top-level shape', () => {
  const root = initialized([]);
  const human = chalk(root, ['doctor']);
  assert.match(human.out, /MANUAL MODE READY · NOT READY for unattended runs/);
  assert.match(human.out, /manual \(valid; no model required\)/);
  assert.match(human.out, /chalk connect --preset autonomous --builder <adapter> --reviewer <adapter>/);
  assert.match(human.out, /manual loop works regardless: chalk next/);

  const json = chalk(root, ['doctor', '--json']);
  const report = JSON.parse(json.out);
  assert.deepEqual(Object.keys(report), ['at', 'node', 'platform', 'agents', 'results']);
  assert.ok(Array.isArray(report.results));
  assert.equal(report.agents.mode, 'manual');
  assert.deepEqual(Object.keys(report.agents).sort(), ['independence', 'mode', 'problems', 'roles', 'version']);
});

test('next and doctor never invoke configured agents, and NO_COLOR output/help contain no ANSI', () => {
  const root = initialized([]);
  const marker = join(root, 'model-called');
  const file = join(root, '.chalk', 'chalk.json');
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  meta.protocol.agents = {
    version: 1,
    profiles: { builder: { adapter: 'fake', command: `${process.execPath} -e "require('fs').writeFileSync('${marker}','called')"`, capabilities: { roles: ['executor'], access: ['workspace-write'], output: ['text'] }, options: {} } },
    roles: { executor: 'builder' },
  };
  writeFileSync(file, JSON.stringify(meta, null, 2));
  chalk(root, ['next']);
  chalk(root, ['doctor']);
  assert.equal(existsSync(marker), false, 'readiness commands inspect configuration only');

  const env = { ...process.env, NO_COLOR: '1' };
  for (const args of [['next'], ['doctor'], ['help']]) {
    const result = chalk(root, args, env);
    assert.doesNotMatch(result.raw, /\x1b\[/, `${args.join(' ')} honors NO_COLOR`);
  }
  assert.match(chalk(root, ['help'], env).out, /chalk next \[--verbose\]/);
  assert.match(chalk(root, ['help'], env).out, /chalk doctor \[--verbose\|--json\]/);
});
