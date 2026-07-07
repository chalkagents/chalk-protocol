// Configurable e2e spec pattern (#83, harness-review finding 10). `isSpec` hardcoded the
// `.test.yaml` suffix, so a team using a different browser-spec convention silently got NO e2e
// gate on their locked specs. Now `protocol.e2e.specPattern` (a suffix, comma-list, or array;
// leading `*` tolerated) selects which locked paths are browser specs; empty/unset keeps the
// historical `.test.yaml` so existing projects are unchanged. This suite pins the matcher's
// normalization AND the end-to-end effect: under a custom pattern a matching locked spec actually
// runs through verify's BYO e2e gate, a non-matching path does not, and the default is preserved.
// Locked contract for the task tracking issue #83.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSpec, specMatcher } from '../lib/e2e.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const tasksOf = (d) => JSON.parse(readFileSync(join(d, '.chalk/tasks.json'), 'utf8'));

test('specMatcher / isSpec — default, custom suffix, comma-list, array, and a leading * are all honored', () => {
  // Default (unset) — the historical .test.yaml, nothing else.
  assert.equal(isSpec('a/login.test.yaml'), true);
  assert.equal(isSpec('a/login.spec.yaml'), false);
  assert.equal(isSpec(42), false, 'non-strings are never specs');
  // Custom single suffix.
  assert.equal(isSpec('a/login.spec.yaml', '.spec.yaml'), true);
  assert.equal(isSpec('a/login.test.yaml', '.spec.yaml'), false, 'a custom pattern REPLACES the default');
  // Comma-separated list and array both match any listed suffix.
  assert.equal(isSpec('x.e2e.yaml', '.test.yaml, .e2e.yaml'), true);
  assert.equal(isSpec('x.test.yaml', ['.test.yaml', '.e2e.yaml']), true);
  assert.equal(isSpec('x.other.yaml', ['.test.yaml', '.e2e.yaml']), false);
  // Leading * (glob-ish) is stripped to a suffix.
  assert.equal(specMatcher('*.e2e.yaml')('flows/checkout.e2e.yaml'), true);
  // Empty / whitespace pattern falls back to the default.
  assert.equal(isSpec('a/login.test.yaml', ''), true);
  assert.equal(isSpec('a/login.test.yaml', '   '), true);
});

// Hermetic BYO e2e runner: writes run.json under --out and exits 0 (pass).
function repoWithRunner(specFile, specPattern) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-e2epat-'));
  chalk(d, 'init', '--name', 'p');
  mkdirSync(join(d, '.chalk/tests'), { recursive: true });
  writeFileSync(join(d, '.chalk/tests', specFile), 'apiVersion: chalk/v1\nkind: Test\nid: spec-x\nname: X\nsteps: []\n');
  writeFileSync(join(d, 'runspec.mjs'), `import {writeFileSync} from 'node:fs'; const a=process.argv; const out=a[a.indexOf('--out')+1];
    writeFileSync(out+'/run.json', JSON.stringify({runId:'r1',specId:'spec-x',status:'passed',startedAt:1,steps:[]}));
    process.exit(0);`);
  conf(d, (o) => { o.e2e = { command: `node ${join(d, 'runspec.mjs')}`, baseUrl: '', runsDir: '.chalk/runs', specPattern }; });
  chalk(d, 'task', 'add', 'feature');
  const tid = tasksOf(d)[0].id.slice(0, 12);
  chalk(d, 'spec', tid, '--criterion', 'works', '--test', `.chalk/tests/${specFile}`);
  chalk(d, 'start', tid);
  return d;
}

test('a custom-suffix spec (.e2e.yaml) actually runs through verify’s e2e gate', () => {
  const d = repoWithRunner('checkout.e2e.yaml', '.e2e.yaml');
  const v = chalk(d, 'verify');
  assert.equal(v.code, 0, `verify GREEN when the custom-pattern spec runs+passes: ${v.out}`);
  assert.match(v.out, /checkout\.e2e\.yaml/, 'the spec appears in the e2e section of the report');
  assert.ok(existsSync(join(d, '.chalk/runs/spec-x')), 'run evidence was produced → the runner actually fired');
});

test('without the pattern, the SAME .e2e.yaml path is not a spec — the e2e gate never runs it', () => {
  // Default pattern (.test.yaml): a .e2e.yaml lock is treated as an ordinary file, not a browser spec.
  const d = repoWithRunner('checkout.e2e.yaml', '.test.yaml');
  const v = chalk(d, 'verify');
  assert.equal(v.code, 0, v.out);
  assert.doesNotMatch(v.out, /e2e.*checkout\.e2e\.yaml/, 'the .e2e.yaml file is not run as a spec under the default pattern');
  assert.ok(!existsSync(join(d, '.chalk/runs/spec-x')), 'no run evidence — the runner never fired for a non-matching path');
});
