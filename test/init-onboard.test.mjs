// First-run `chalk init` — the path of least resistance must be the SAFE one.
//   - The stack preset is auto-detected by DEFAULT (no flag needed): a stranger's `chalk init` in a
//     node/flutter/go/python project gets real verify commands, not an empty config.
//   - An empty verify is the vacuous-green trap (all gates skip → GREEN while checking nothing), so
//     bare init in an unrecognized project WARNS loudly; `--bare` is the explicit acknowledgment;
//     `--verify-test "<cmd>"` sets the one required gate inline.
//   - `chalk verify` labels a vacuous green EVERY time it prints, not just at init.
//   - Presets turn the break-it lever ON where a truthful per-file command exists (adoption default:
//     the strongest levers must not all be opt-in).
//   - Init ends with a numbered next-steps block (task add → spec → start → verify/done).
// Locked contract for task-918646d.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'init-onboard-'));
const protoOf = (d) => JSON.parse(readFileSync(join(d, '.chalk', 'chalk.json'), 'utf8')).protocol;

test('detectPreset — every marker-file branch and the flutter-over-node precedence', async () => {
  const { detectPreset, PRESETS } = await import('../lib/config.mjs');
  const mark = (files) => { const d = scratch(); for (const f of files) writeFileSync(join(d, f), 'x'); return d; };
  assert.equal(detectPreset(mark(['pubspec.yaml'])), 'flutter');
  assert.equal(detectPreset(mark(['go.mod'])), 'go');
  assert.equal(detectPreset(mark(['package.json'])), 'node');
  assert.equal(detectPreset(mark(['pyproject.toml'])), 'python');
  assert.equal(detectPreset(mark(['requirements.txt'])), 'python');
  assert.equal(detectPreset(mark(['pubspec.yaml', 'package.json'])), 'flutter', 'flutter ⊃ dart wins over a stray package.json');
  assert.equal(detectPreset(mark([])), null);
  // Adoption default: break-it ON wherever a per-file test command is truthful; go DELIBERATELY off
  // (go test <file> needs the package's other files, so a single-file probe would lie).
  assert.equal(PRESETS.node.breakTest, 'node --test {test}');
  assert.equal(PRESETS.flutter.breakTest, 'flutter test {test}');
  assert.equal(PRESETS.dart.breakTest, 'dart test {test}');
  assert.equal(PRESETS.python.breakTest, 'pytest -q {test}');
  assert.equal(PRESETS.go.breakTest, undefined, 'go must NOT get a lying per-file probe');
});

test('bare init AUTO-DETECTS the preset from a manifest (node) and says so', () => {
  const d = scratch();
  writeFileSync(join(d, 'package.json'), '{"name":"x"}');
  const r = chalk(d, 'init', '--name', 't');
  assert.equal(r.code, 0);
  assert.match(r.out, /preset node \(auto-detected/);
  const p = protoOf(d);
  assert.equal(p.verify.test, 'node --test', 'verify filled from the detected preset');
  assert.equal(p.breakTest, 'node --test {test}', 'break-it lever ON by default for node');
});

test('bare init with NO detectable stack warns VACUOUS loudly (exit 0, spine still created)', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't');
  assert.equal(r.code, 0, 'a warning, not a refusal — empty playgrounds are legitimate');
  assert.match(r.out, /VACUOUSLY/);
  assert.match(r.out, /protocol\.verify\.test/);
  assert.equal(protoOf(d).verify.test, '', 'verify honestly left empty, not guessed');
});

test('--bare acknowledges an intentionally empty verify and silences the warning', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--bare');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /VACUOUSLY/);
});

test('--bare also opts out of auto-detection when a manifest exists', () => {
  const d = scratch();
  writeFileSync(join(d, 'package.json'), '{"name":"x"}');
  chalk(d, 'init', '--name', 't', '--bare');
  assert.equal(protoOf(d).verify.test, '', '--bare means bare, even in a node project');
});

test('--verify-test "<cmd>" sets the required gate inline and satisfies the warning', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--verify-test', 'make check');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /VACUOUSLY/);
  assert.equal(protoOf(d).verify.test, 'make check');
});

test('explicit --preset still wins over detection', () => {
  const d = scratch();
  writeFileSync(join(d, 'package.json'), '{"name":"x"}');
  chalk(d, 'init', '--name', 't', '--preset', 'python');
  assert.equal(protoOf(d).verify.test, 'pytest -q');
  assert.equal(protoOf(d).breakTest, 'pytest -q {test}');
});

test('init ends with the numbered next-steps block (task add, spec+lock, start, verify/done, doctor, demo)', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--bare');
  assert.match(r.out, /next steps/);
  assert.match(r.out, /1\. chalk task add/);
  assert.match(r.out, /LOCK the test/);
  assert.match(r.out, /3\. chalk start/);
  assert.match(r.out, /4\. chalk verify\s+→\s+chalk done/);
  assert.match(r.out, /chalk doctor/, 'the preflight is named');
  assert.match(r.out, /chalk demo/);
});

test('bare --preset that detects nothing says so explicitly (the user asked for detection)', () => {
  const d = scratch();
  const r = chalk(d, 'init', '--name', 't', '--preset');
  assert.equal(r.code, 0);
  assert.match(r.out, /could not detect a preset/);
});

test('chalk verify labels a vacuous green EVERY time, and an honest green is not labeled', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 't', '--bare');
  const vac = chalk(d, 'verify');
  assert.equal(vac.code, 0, 'exit code unchanged — vacuous is a label, not a new gate');
  assert.match(vac.out, /GREEN/);
  assert.match(vac.out, /VACUOUS — no verify commands configured/);

  const d2 = scratch();
  writeFileSync(join(d2, 'package.json'), '{"name":"x"}');
  chalk(d2, 'init', '--name', 't'); // auto-detected node preset → real command
  writeFileSync(join(d2, 'x.test.mjs'), `import { test } from 'node:test'; test('ok', () => {});\n`);
  const real = chalk(d2, 'verify');
  assert.equal(real.code, 0);
  assert.doesNotMatch(real.out, /VACUOUS/, 'an honest green carries no vacuous label');
});
