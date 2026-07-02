// Claude Code onboarding — `chalk init --executor claude` must leave a project ACTUALLY runnable:
// the four agent commands wired in chalk.json AND the agent definitions those commands name
// installed under .claude/agents/. The definitions ship in the npm package (share/agents/) as
// copies of this repo's own dogfooded agents minus repo-local front-matter — and THIS test is the
// drift gate that pins the two copies together forever: edit .claude/agents/* without updating
// share/agents/* (or vice versa) and the suite goes red. Locked contract for task-58f6359.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'agents-sync-'));
const protoOf = (d) => JSON.parse(readFileSync(join(d, '.chalk', 'chalk.json'), 'utf8')).protocol;

const AGENTS = ['chalk-executor', 'chalk-planner', 'chalk-reviewer', 'chalk-retro'];

test('drift gate — shipped template ≡ dogfood agent minus ONLY the skills line (front-matter pinned too)', () => {
  for (const name of AGENTS) {
    const shipped = readFileSync(join(ROOT, 'share', 'agents', `${name}.md`), 'utf8');
    const dogfood = readFileSync(join(ROOT, '.claude', 'agents', `${name}.md`), 'utf8');
    assert.equal(shipped, dogfood.replace(/^skills:.*\n/m, ''),
      `${name}: shipped template must be the dogfooded agent with exactly the skills: line removed — name/description/tools/model drift is drift`);
    assert.match(dogfood, /^skills:/m, `${name}: the dogfood copy keeps its repo-local skills line (the strip is real, not vacuous)`);
  }
});

test('the templates actually SHIP — share/ is in the npm files array and lands in the packed tarball', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('share'), 'package.json files[] must include share/ or installClaudeAgents ENOENTs for npm users');
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, `npm pack --dry-run failed: ${r.stderr}`);
  const packed = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const name of AGENTS) {
    assert.ok(packed.includes(`share/agents/${name}.md`), `share/agents/${name}.md missing from the npm tarball`);
  }
});

test('the wiring doc the CLI points at exists', () => {
  assert.ok(existsSync(join(ROOT, 'docs', 'integrations', 'claude-code.md')),
    'chalk agents --claude prints docs/integrations/claude-code.md — it must not be a 404');
});

test('init --executor claude — installs the four agent files and wires all four commands', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--bare', '--executor', 'claude');
  assert.equal(r.code, 0, r.out);
  for (const name of AGENTS) {
    const f = join(d, '.claude', 'agents', `${name}.md`);
    assert.ok(existsSync(f), `${name}.md installed`);
    assert.doesNotMatch(readFileSync(f, 'utf8'), /^skills:/m, 'installed copy carries no repo-local skills');
  }
  const p = protoOf(d);
  assert.match(p.executor.command, /claude -p --agent chalk-executor/);
  assert.match(p.planner.command, /claude -p --agent chalk-planner/);
  assert.match(p.review.command, /claude -p --agent chalk-reviewer/);
  assert.match(p.retro.command, /claude -p --agent chalk-retro/);
  assert.deepEqual(p.review.requiredAt, ['per-task'], 'an executor without an adversary is not the protocol');
  assert.match(r.out, /needs the `claude` CLI on PATH/, 'the PATH prerequisite is stated');
});

test('write-if-absent — a user-edited agent survives re-runs of agents --claude (init refuses on an existing spine by design)', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 't', '--bare', '--executor', 'claude');
  const mine = join(d, '.claude', 'agents', 'chalk-executor.md');
  writeFileSync(mine, '# my hand-tuned executor\n');
  const r = chalk(d, 'agents', '--claude');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /exists, kept .claude\/agents\/chalk-executor\.md/);
  assert.equal(readFileSync(mine, 'utf8'), '# my hand-tuned executor\n', 'the user edit is never clobbered');
});

test('chalk agents --claude — the retrofit path installs into an already-inited project', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 't', '--bare'); // no executor at init time
  const r = chalk(d, 'agents', '--claude');
  assert.equal(r.code, 0, r.out);
  for (const name of AGENTS) assert.ok(existsSync(join(d, '.claude', 'agents', `${name}.md`)), `${name}.md retrofitted`);
  assert.match(r.out, /docs\/integrations\/claude-code\.md/, 'points at the wiring doc (commands are not auto-set on retrofit)');
});

test('init --executor none — first-class manual loop, spelled out; bogus values refused', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--bare', '--executor', 'none');
  assert.equal(r.code, 0);
  assert.match(r.out, /manual loop/);
  assert.match(r.out, /chalk next → write code → chalk verify → chalk done/);
  assert.equal(protoOf(d).executor.command, '', 'none means none');

  const bad = chalk(scratch(), 'init', '--name', 't', '--executor', 'cursor');
  assert.notEqual(bad.code, 0);
  assert.match(bad.out, /claude\|opencode\|none/);
});
