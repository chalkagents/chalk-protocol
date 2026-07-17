// D3 (#217) — reframe the gates as ONE OPTIONAL "Checks" part. The gates (P1–P7 + verify/review/held-out)
// once read as chalk's whole product ("catch the cheating agent"). The pivot demotes them to one
// composable part of the kit — the accept button — powerful but optional, alongside agents/skills/flows.
// The director's taste is the core. This pins that framing in `chalk harness` + docs. Locked for
// task-58e2ced9.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'chalk.mjs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: strip(`${r.stdout || ''}${r.stderr || ''}`) }; };
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };
const project = () => { const d = mkdtempSync(join(tmpdir(), 'chalk-reframe-')); chalk(d, 'init', '--name', 'demo', '--bare'); return d; };

test('chalk harness — frames Checks as OPTIONAL, the accept button, one part of the kit', () => {
  const out = chalk(project(), 'harness').out;
  assert.match(out, /Checks[^\n]*OPTIONAL/i, 'the Checks section is marked optional');
  assert.match(out, /accept button/i, 'framed as the accept button, not the product');
  assert.match(out, /one part of the kit/i, 'explicitly one part');
});

test('chalk harness — a checks-OFF project renders coherently (runs without gates)', () => {
  const d = project();
  conf(d, (o) => { o.verify = { test: '', typecheck: '', lint: '', build: '' }; o.review = { command: '', requiredAt: [] }; o.regression = { ...(o.regression || {}), required: false }; o.requireTest = false; });
  const out = chalk(d, 'harness').out;
  assert.equal(chalk(d, 'harness').code, 0, 'no crash with everything off');
  assert.match(out, /all optional — this project runs without gates/i, 'a checks-off project is coherent, not broken');
});

test('chalk harness — closes by naming the CORE (taste/judgment), gates as one part', () => {
  const out = chalk(project(), 'harness').out;
  assert.match(out, /gates are one part/i);
  assert.match(out, /align · digest · pending · raise/i, 'the director-core mechanisms are named as the center');
});

test('docs/harness.md — frames the gates as one optional Checks part, taste as the core', () => {
  const p = join(ROOT, 'docs', 'harness.md');
  assert.ok(existsSync(p), 'the harness doc exists');
  const md = readFileSync(p, 'utf8');
  assert.match(md, /one optional part|one part of the kit/i, 'gates framed as one part');
  assert.match(md, /accept button/i);
  assert.match(md, /the core is not the kit — it's you|taste and judgment being first-class/i, 'names the defensible core');
});
