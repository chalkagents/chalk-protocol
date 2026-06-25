// Chalk Protocol — P7 held-out regression.
// Research (SpecBench): once the visible test suite is the optimization target it stops
// measuring spec satisfaction, and the hack-gap grows with code size. The defense is a
// regression/composition set the implementing agent never sees. In a SOLO harness "held-out"
// = separation of ROLE + VISIBILITY (not a second human): authored from the spec by a guard
// pass, kept out of the agent's context, and surfaced only as pass/fail so it can't overfit.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { sha256 } from './store.mjs';
import { withRunner } from './config.mjs';
import { runToolchain } from './verify.mjs';

const SRC_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cc', '.cpp', '.h', '.hpp', '.swift', '.kt', '.scala']);
const SKIP = new Set(['.chalk', '.git', 'node_modules', 'dist', 'build', '.next', 'coverage', 'out', 'vendor', '.venv']);

// A coarse cumulative-size signal — the gate stringency scales with this.
export function codeSize(root) {
  let loc = 0, files = 0;
  const walk = (dir) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (SRC_EXT.has(extname(e.name))) {
        try { loc += readFileSync(p, 'utf8').split('\n').length; files++; } catch { /* unreadable */ }
      }
    }
  };
  walk(root);
  return { loc, files };
}

export function lockFile(root, absPath) {
  if (!existsSync(absPath)) throw new Error(`held-out file not found: ${absPath}`);
  return { path: relative(root, absPath), sha256: sha256(readFileSync(absPath)) };
}

export function brokenHeldOut(root, tests = []) {
  const broken = [];
  for (const t of tests) {
    const abs = join(root, t.path);
    const cur = existsSync(abs) ? sha256(readFileSync(abs)) : null;
    if (cur !== t.sha256) broken.push(t.path);
  }
  return broken;
}

export function listDirFiles(root, dir) {
  const base = join(root, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(base, e.name));
}

// Run the held-out set. CRITICAL: stdout/stderr are DISCARDED — only pass/fail escapes,
// so the agent cannot read the hidden assertions and overfit to them.
export function runAudit(store) {
  const meta = store.meta();
  const proto = meta.protocol || {};
  const reg = proto.regression || {};
  const broken = brokenHeldOut(store.root, reg.tests);
  const size = codeSize(store.root);
  // Phase-boundary toolchain gates (e.g. a full build marked when:'phase') run here — NORMAL
  // pass/fail with captured output (these are the agent's own toolchain, not hidden tests).
  const phaseGates = runToolchain(store.root, proto.verify || {}, { runner: proto.runner, mode: 'phase' });
  const phaseGreen = phaseGates.every((r) => r.status !== 'fail');
  if (!reg.command) return { status: 'unconfigured', broken, size, phaseGates, green: broken.length === 0 && phaseGreen };
  let passed = true;
  try { execSync(withRunner(proto.runner, reg.command), { cwd: store.root, stdio: 'ignore', timeout: 10 * 60 * 1000 }); }
  catch { passed = false; }
  return { status: 'ok', passed, green: passed && broken.length === 0 && phaseGreen, broken, size, phaseGates };
}

// Prompt for the guard author — derive tests from intent, NOT from the implementation.
export function buildGuardPrompt(meta, spec, criteria) {
  return `You are authoring HELD-OUT regression / composition tests. Derive them from the SPEC
ONLY — do NOT read the implementation source, so the tests independently verify intent
rather than mirroring whatever the code happens to do. Write test files into
${meta.protocol?.regression?.dir || '.chalk/held-out'}/. Cover the criteria in combination (composition),
plus edge cases the happy-path acceptance tests likely miss.

# Goal
${meta.project?.description || '(none)'}

# Spec
${spec || '(none)'}

# Acceptance criteria across all tasks
${criteria || '(none)'}`;
}
