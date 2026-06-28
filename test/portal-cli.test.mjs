// `chalk portal` end-to-end — publishes the spine as client-facing portal data: four
// schema-conformant files under .project/, parseable, with scope/milestones/updates mapped.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const readYaml = (p) => JSON.parse(readFileSync(p, 'utf8')); // files are JSON (valid YAML)

// A project named "Demo App" with a done+released task, an in-progress task, and a milestone.
function project() {
  const d = mkdtempSync(join(tmpdir(), 'portal-cli-'));
  chalk(d, 'init', '--name', 'Demo App');
  const f = join(d, '.chalk/tasks.json');
  writeFileSync(f, JSON.stringify([
    { id: 'task-a', title: 'feat: add sorting', state: 'done', released: '1.0.0', milestone: 'core', doneAt: '2026-06-01', acceptanceCriteria: [{ text: 'streak desc' }], tests: [] },
    { id: 'task-b', title: 'Reminders', state: 'in-progress', milestone: 'core', acceptanceCriteria: [{ text: 'pick a time' }], tests: [] },
  ], null, 2));
  return d;
}

test('chalk portal — writes the four schema files under .project, parseable, with mapped data', () => {
  const d = project();
  const r = chalk(d, 'portal');
  assert.equal(r.status, 0);

  const base = join(d, '.project');
  assert.ok(existsSync(join(base, 'projects/demo-app.yaml')), 'project meta file (slug from name)');
  const scope = readYaml(join(base, 'scope/defined.yaml'));
  const ms = readYaml(join(base, 'milestones.yaml'));
  assert.ok(existsSync(join(base, 'updates/extracted.yaml')), 'updates file written');

  assert.equal(scope.length, 2);
  const sorted = scope.find((x) => x.title === 'add sorting');
  assert.equal(sorted.state, 'delivered', 'done → delivered');
  assert.match(sorted.verify, /1\.0\.0/, 'released → verify note');
  assert.equal(scope.find((x) => x.title === 'Reminders').state, 'approved', 'in-progress → approved');

  assert.equal(ms.length, 1);
  assert.equal(ms[0].title, 'core');
  assert.equal(ms[0].status, 'in-progress', '1 of 2 done');
});

test('chalk portal — --out and --slug honored', () => {
  const d = project();
  assert.equal(chalk(d, 'portal', '--out', 'pub', '--slug', 'acme').status, 0);
  assert.ok(existsSync(join(d, 'pub/projects/acme.yaml')), 'custom out dir + slug');
  assert.ok(existsSync(join(d, 'pub/scope/defined.yaml')));
});

test('chalk portal — --dry-run writes nothing', () => {
  const d = project();
  const r = chalk(d, 'portal', '--dry-run');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /would write/);
  assert.equal(existsSync(join(d, '.project')), false, 'no files written in dry-run');
});
