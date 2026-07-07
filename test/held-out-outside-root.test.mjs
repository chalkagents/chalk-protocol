// Held-out set outside the repo root (#82, harness-review finding 1, manual mode). A git worktree
// hides a gitignored in-repo held-out dir, but in MANUAL mode the agent works in the primary
// checkout and can just read `.chalk/held-out/` — the contract forbids it, nothing enforced it.
// Now `regression.dir` may be an absolute / `~`-prefixed path OUTSIDE the repo, supported end-to-end:
// listing + locking (guard), integrity + audit, and a doctor recommendation to relocate the set
// when worktree isolation is off. This suite pins the path resolver, the inside-vs-outside lock
// storage + round-trip, listing an absolute dir, an end-to-end guard-lock → audit (green intact /
// RED tampered) on an outside file, and the doctor recommendation (both directions). Every fixture
// uses throwaway temp dirs — never the real held-out set. Locked contract for issue #82.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldOutBase, lockFile, brokenHeldOut, listDirFiles } from '../lib/regression.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'chalk.mjs');
const chalk = (cwd, ...args) => { const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const scratch = () => mkdtempSync(join(tmpdir(), 'chalk-heldout-'));
const conf = (d, fn) => { const f = join(d, '.chalk/chalk.json'); const o = JSON.parse(readFileSync(f, 'utf8')); fn(o.protocol); writeFileSync(f, JSON.stringify(o, null, 2)); };

test('heldOutBase — repo-relative default, absolute pass-through, and ~ expansion', () => {
  const root = '/repo';
  assert.equal(heldOutBase(root, undefined), join(root, '.chalk/held-out'), 'unset → historical default under the repo');
  assert.equal(heldOutBase(root, '.chalk/held-out'), join(root, '.chalk/held-out'), 'relative → under the repo');
  assert.equal(heldOutBase(root, '/var/held/proj'), '/var/held/proj', 'absolute → used as-is (outside the repo)');
  assert.equal(heldOutBase(root, '~/.chalk-held-out/proj'), join(homedir(), '.chalk-held-out/proj'), '~ expands to the home dir');
});

test('lockFile — stores repo-relative INSIDE the repo, absolute OUTSIDE; brokenHeldOut round-trips both', () => {
  const root = scratch();
  // Inside the repo.
  mkdirSync(join(root, '.chalk/held-out'), { recursive: true });
  const inFile = join(root, '.chalk/held-out/a.test.mjs');
  writeFileSync(inFile, 'inside\n');
  const inLock = lockFile(root, inFile);
  assert.equal(inLock.path, '.chalk/held-out/a.test.mjs', 'inside → repo-relative (portable)');
  // Outside the repo.
  const outDir = scratch();
  const outFile = join(outDir, 'b.test.mjs');
  writeFileSync(outFile, 'outside\n');
  const outLock = lockFile(root, outFile);
  assert.ok(isAbsolute(outLock.path), 'outside → absolute (a ../../ relative path would be brittle)');
  assert.equal(outLock.path, outFile);
  // brokenHeldOut resolves both forms: intact → no breaks.
  assert.deepEqual(brokenHeldOut(root, [inLock, outLock]), [], 'intact inside + outside locks are not broken');
  // Tamper the OUTSIDE file → detected via the absolute lock path.
  writeFileSync(outFile, 'tampered\n');
  assert.deepEqual(brokenHeldOut(root, [inLock, outLock]), [outLock.path], 'a tampered outside held-out file is caught');
});

test('listDirFiles — lists files under an ABSOLUTE dir outside the repo', () => {
  const root = scratch();
  const outDir = scratch();
  writeFileSync(join(outDir, 'x.test.mjs'), '1\n');
  writeFileSync(join(outDir, 'y.test.mjs'), '2\n');
  const files = listDirFiles(root, outDir).sort();
  assert.equal(files.length, 2, 'both files under the absolute dir are listed');
  assert.ok(files.every((f) => isAbsolute(f) && f.startsWith(outDir)), 'listed paths are absolute under the outside dir');
});

test('end-to-end — guard-lock an OUTSIDE file, then audit is GREEN intact and RED when it is tampered', () => {
  const d = scratch();
  chalk(d, 'init', '--name', 'p');
  const outDir = scratch();
  const spec = join(outDir, 'compose.test.mjs');
  writeFileSync(spec, "import {test} from 'node:test'; test('held',()=>{});\n");
  // Point regression at the OUTSIDE dir and give it a runnable (trivially-passing) command.
  conf(d, (o) => { o.regression = { ...(o.regression || {}), dir: outDir, command: 'node -e "process.exit(0)"', tests: [] }; });
  const g = chalk(d, 'guard', 'add', spec);
  assert.equal(g.code, 0, `guard add locks an outside file: ${g.out}`);
  const locked = JSON.parse(readFileSync(join(d, '.chalk/chalk.json'), 'utf8')).protocol.regression.tests;
  assert.equal(locked.length, 1);
  assert.ok(isAbsolute(locked[0].path), 'the outside held-out file is locked by absolute path');
  assert.equal(chalk(d, 'audit').code, 0, 'audit GREEN while the outside held-out file is intact');
  // Tamper the outside held-out file → audit RED (integrity break detected across the repo boundary).
  writeFileSync(spec, "import {test} from 'node:test'; test('held',()=>{ /* gutted */ });\n");
  const a2 = chalk(d, 'audit');
  assert.equal(a2.code, 2, `audit RED when the outside held-out file is tampered: ${a2.out}`);
});

test('doctor — recommends an outside held-out dir in manual mode; stays quiet once it is outside', () => {
  const mk = (dir) => {
    const d = scratch();
    chalk(d, 'init', '--name', 'p');
    conf(d, (o) => { o.worktree = { ...(o.worktree || {}), enabled: false }; o.regression = { ...(o.regression || {}), dir, command: 'node -e "0"', tests: [{ path: 'x', sha256: 'y' }] }; });
    return d;
  };
  // In-repo held-out + no worktree isolation → recommend relocating outside.
  assert.match(chalk(mk('.chalk/held-out'), 'doctor').out, /move it outside the repo/i, 'manual mode + in-repo set → recommendation');
  // Already outside (absolute) → no such recommendation.
  assert.doesNotMatch(chalk(mk('/var/held/proj'), 'doctor').out, /move it outside the repo/i, 'absolute dir → no recommendation');
});
