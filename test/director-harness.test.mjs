// D1 (#216) — the kit made visible. Chalk already HAS the parts (agents via protocol.*, checks via the
// gates, flows via run/pipeline/loop, skills via #215) but nothing showed them as one assembled kit.
// `chalk harness` is a read-only view of the composition — the spine as the star. Locked for task-225f6a98.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };

function project() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-harness-'));
  chalk(d, 'init', '--name', 'payments', '--bare');
  return d;
}

test('chalk harness — shows the four parts (Agents, Skills, Checks, Flows)', () => {
  const r = chalk(project(), 'harness');
  assert.equal(r.code, 0, r.out);
  for (const part of ['Agents', 'Skills', 'Checks', 'Flows']) assert.match(r.out, new RegExp(part), `the harness shows ${part}`);
  assert.match(r.out, /run · pipeline · loop · autopilot/, 'the flows are named');
});

test('chalk harness — reflects actual config: wired agents + configured checks vs empty', () => {
  const d = project();
  conf(d, (o) => {
    o.executor = { command: 'claude -p --agent chalk-executor' };
    o.review = { command: 'claude -p --agent chalk-reviewer', requiredAt: ['per-task'] };
    o.verify = { test: 'npm test', typecheck: '', lint: '', build: '' };
  });
  chalk(d, 'skill', 'add', 'api-conventions', 'Use snake_case.');
  const out = chalk(d, 'harness').out;
  assert.match(out, /executor\s+claude -p --agent chalk-executor/, 'a wired agent shows its command');
  assert.match(out, /planner\s+\(not wired\)/, 'an unwired agent is marked not wired');
  assert.match(out, /reviewer\s+claude -p --agent chalk-reviewer/);
  assert.match(out, /verify\s+test/, 'configured verify gates are listed');
  assert.match(out, /review\s+adversarial/, 'the review check reflects the wired reviewer');
  assert.match(out, /◆ api-conventions/, 'project skills are surfaced');
});

test('chalk harness — a BARE project still renders coherently (none/off states, no crash)', () => {
  const out = chalk(project(), 'harness').out;
  assert.match(out, /planner\s+\(not wired\)/);
  assert.match(out, /retro\s+\(not wired\)/, 'the retro agent row renders (unwired on a bare project)');
  assert.match(out, /Skills[\s\S]*\(none/, 'skills show a none-state');
  assert.match(out, /verify\s+\(none configured/, 'an empty verify is shown, not hidden');
  assert.match(out, /held-out\s+off/, 'the held-out check row renders (off by default)');
  assert.match(out, /require-test on/, 'the require-test check row renders (on by default)');
});

test('chalk harness — is READ-ONLY (does not mutate the spine)', () => {
  const d = project();
  const before = readFileSync(join(d, '.chalk/tasks.json'), 'utf8') + readFileSync(join(d, '.chalk/chalk.json'), 'utf8');
  chalk(d, 'harness');
  const after = readFileSync(join(d, '.chalk/tasks.json'), 'utf8') + readFileSync(join(d, '.chalk/chalk.json'), 'utf8');
  assert.equal(before, after, 'harness is purely informational — it changes nothing');
});
