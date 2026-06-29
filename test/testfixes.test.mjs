// Bugs found by exercising the lifecycle commands live (not caught by the per-command suites):
//   1. `chalk release` ignored --dry-run and ran for real (no preview path).
//   2. `chalk portal --out <absolute>` used path.join(root, out) → wrote inside the repo.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...a) => spawnSync('node', [CLI, ...a], { cwd, encoding: 'utf8' });
const tasksFile = (d) => join(d, '.chalk/tasks.json');

function project() {
  const d = mkdtempSync(join(tmpdir(), 'testfixes-'));
  execSync('git init -b main', { cwd: d, stdio: 'pipe' });
  execSync('git config user.email t@t.t && git config user.name t', { cwd: d, stdio: 'pipe' });
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '1.2.3' }, null, 2));
  execSync('git add -A && git commit -q -m base', { cwd: d, stdio: 'pipe' });
  writeFileSync(tasksFile(d), JSON.stringify([
    { id: 'task-a', title: 'feat: a feature', state: 'done', branchType: 'feat', doneAt: '2026-06-01', acceptanceCriteria: [{ text: 'x' }], tests: [] },
  ], null, 2));
  return d;
}

test('chalk release --dry-run — previews, but writes/tags/marks NOTHING', () => {
  const d = project();
  const r = chalk(d, 'release', '--dry-run');
  assert.equal(r.status, 0);
  assert.match(`${r.stdout}${r.stderr}`, /1\.3\.0/, 'shows the would-be version');
  assert.match(`${r.stdout}${r.stderr}`, /dry-run/i);
  // none of the side effects happened:
  assert.equal(existsSync(join(d, 'CHANGELOG.md')), false, 'no CHANGELOG written');
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, '1.2.3', 'version not bumped');
  assert.equal(execSync('git tag', { cwd: d, encoding: 'utf8' }).trim(), '', 'no tag created');
  assert.ok(!JSON.parse(readFileSync(tasksFile(d), 'utf8'))[0].released, 'task NOT marked released');
  // and a real run afterwards still works (dry-run didn't consume the releasable tasks)
  assert.equal(chalk(d, 'release').status, 0);
  assert.equal(JSON.parse(readFileSync(tasksFile(d), 'utf8'))[0].released, '1.3.0', 'real run then marks it');
});

test('chalk portal --out <absolute> — writes to the absolute path, not inside the repo', () => {
  const d = project();
  const abs = mkdtempSync(join(tmpdir(), 'portal-abs-'));
  const r = chalk(d, 'portal', '--out', abs);
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(abs, 'scope/defined.yaml')), 'wrote to the absolute --out path');
  assert.equal(existsSync(join(d, abs.replace(/^\//, ''))), false, 'did NOT write a mirror path inside the repo');
});

test('chalk portal --out <relative> — stays relative to the repo root', () => {
  const d = project();
  assert.equal(chalk(d, 'portal', '--out', 'pub').status, 0);
  assert.ok(existsSync(join(d, 'pub/scope/defined.yaml')), 'relative --out under the repo root');
});
