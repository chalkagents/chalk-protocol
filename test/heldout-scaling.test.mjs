// M4 — P7 stringency scales with code size. SpecBench: the visible-vs-held-out reward-hacking gap grows
// ~28 points per 10× code, and agents saturate the visible suite while failing hidden composition — so a
// FIXED held-out set is not enough; the oracle must GROW with the code. Today `codeSize` only triggers
// staleness (re-audit on LOC change); this makes the held-out COUNT a floor that scales with LOC, warned in
// `chalk audit` and enforced (overridably) by the `phase` gate. Locked contract.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldOutFloor } from '../lib/regression.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};
const conf = (d, fn) => {
  const f = join(d, '.chalk/chalk.json');
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o.protocol);
  writeFileSync(f, JSON.stringify(o, null, 2));
};
// A scratch project with `loc` lines of real source and a fast-scaling floor (locPerTest 5), held-out empty.
function project(loc) {
  const d = mkdtempSync(join(tmpdir(), 'chalk-scale-'));
  chalk(d, 'init', '--name', 'demo');
  writeFileSync(join(d, 'src.mjs'), Array.from({ length: loc }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n');
  conf(d, (p) => { p.regression = { ...(p.regression || {}), command: 'true', required: true, dir: '.chalk/held-out', tests: [], locPerTest: 5 }; });
  return d;
}

test('heldOutFloor — the minimum held-out count scales with code size (floor = loc / locPerTest)', () => {
  assert.equal(heldOutFloor(0), 0, 'no code → no held-out required');
  assert.equal(heldOutFloor(6000, 2000), 3);
  assert.equal(heldOutFloor(1999, 2000), 0, 'below one unit → floor 0');
  assert.equal(heldOutFloor(30, 5), 6, 'a faster scale demands more');
  assert.equal(heldOutFloor(6000, 0), 3, 'a non-positive locPerTest falls back to the default (2000)');
});

test('phase — P7 refuses to advance when the held-out set is below the size floor (overridable, logged)', () => {
  const d = project(40); // ~41 LOC, locPerTest 5 → floor ≥ 8; 0 held-out tests → understaffed
  // Make the audit green + fresh, so the ONLY remaining P7 blocker is the size floor (not staleness/RED).
  assert.equal(chalk(d, 'audit').code, 0, 'audit is green (command exits 0, no held-out integrity issue)');
  const blocked = chalk(d, 'phase', 'build');
  assert.notEqual(blocked.code, 0, 'phase refuses even with a green audit — the held-out set is too small for the code');
  assert.match(blocked.out, /held-out|floor|scales/i, 'the refusal cites the size floor');
  // Overridable with a logged reason (bootstrapping), like the rest of P7.
  const forced = chalk(d, 'phase', 'build', '--force-audit', '--why', 'bootstrapping the held-out set');
  assert.equal(forced.code, 0, 'force-audit --why overrides the floor');
  assert.match(readFileSync(join(d, '.chalk/decisions.md'), 'utf8'), /audit gate|phase/i, 'the override is logged');
});

test('audit — WARNS (but stays green) when the held-out set is below the size floor', () => {
  const d = project(40);
  const r = chalk(d, 'audit');
  assert.equal(r.code, 0, 'the size floor is a warning, not an audit failure (audit is about correctness)');
  assert.match(r.out, /below the size floor|floor/i, 'audit surfaces that the held-out set has not grown with the code');
});
