// D2 (#215) — skills as a first-class part of the kit. The pivot promotes SKILLS (reusable domain
// how-to — "how this project does X") to first-class. Distinct from lessons (mistakes not to repeat),
// a skill is the affirmative playbook: authored as .chalk/skills/<name>.md and injected into every
// agent's context, bounded like the other elastic blocks. Just injected text, never executable — that's
// the guardrail against framework-creep. Locked for task-0547837d.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPINE_STATE_PATHS } from '../lib/store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };

function project() {
  const d = mkdtempSync(join(tmpdir(), 'chalk-skills-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, '.chalk/tasks.json'), JSON.stringify([{
    id: 'task-9f3a2b1c', title: 'feat: a thing', state: 'in-progress', acceptanceCriteria: [{ text: 'UNIQUE_CRIT_XYZ' }], tests: [],
  }]));
  return d;
}

test('chalk skill add — writes .chalk/skills/<slug>.md from inline text or a file; list shows them', () => {
  const d = project();
  assert.equal(chalk(d, 'skill', 'add', 'API Conventions', 'Always use snake_case for JSON fields.').code, 0);
  assert.ok(existsSync(join(d, '.chalk/skills/api-conventions.md')), 'name is slugged to a .md file');
  assert.match(readFileSync(join(d, '.chalk/skills/api-conventions.md'), 'utf8'), /snake_case/);
  writeFileSync(join(d, 'testing.md'), 'Prefer table-driven tests.');
  assert.equal(chalk(d, 'skill', 'add', 'testing-style', '--file', join(d, 'testing.md')).code, 0);
  const list = chalk(d, 'skill').out;
  assert.match(list, /api-conventions/);
  assert.match(list, /testing-style/);
});

test('chalk skill add — refuses an empty skill', () => {
  const d = project();
  assert.notEqual(chalk(d, 'skill', 'add', 'empty-one').code, 0, 'a skill needs content');
});

test('buildContext injects a Project skills block that the agent applies', () => {
  const d = project();
  chalk(d, 'skill', 'add', 'api-conventions', 'Always use snake_case for JSON fields.');
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /## Project skills \(apply these/i, 'the skills block renders');
  assert.match(out, /### api-conventions/, 'each skill is a titled section');
  assert.match(out, /snake_case for JSON fields/, 'the skill content is injected');
});

test('skills are elastic — present at a normal budget, dropped under a tiny one (essentials survive)', () => {
  const d = project();
  chalk(d, 'skill', 'add', 'big-skill', 'x'.repeat(400));
  assert.match(chalk(d, 'context', 'task-9f3a2b1c').out, /Project skills/i, 'present at default budget');
  const cf = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(cf, 'utf8'));
  o.protocol.contextBudget = 1; writeFileSync(cf, JSON.stringify(o, null, 2));
  const tiny = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.doesNotMatch(tiny, /Project skills/i, 'skills yield under extreme pressure');
  assert.match(tiny, /UNIQUE_CRIT_XYZ/, 'essentials (criteria) survive');
});

test('skills rank ABOVE auto-lessons — both present, skills first, lessons kept (priority, not exclusion)', () => {
  const d = project();
  chalk(d, 'skill', 'add', 'a-skill', 'the affirmative playbook line');
  chalk(d, 'lesson', 'add', 'an auto-collected lesson to keep');
  const out = chalk(d, 'context', 'task-9f3a2b1c').out;
  assert.match(out, /Project skills/i, 'skills present');
  assert.match(out, /an auto-collected lesson to keep/, 'lessons NOT dropped just because skills exist');
  assert.ok(out.indexOf('Project skills') < out.indexOf('Lessons learned'),
    'author-curated skills rank ahead of machine-accumulated lessons');
});

test('.chalk/skills is spine state — committed by intake, excluded from review diffs', () => {
  assert.ok(SPINE_STATE_PATHS.includes('.chalk/skills'));
});
