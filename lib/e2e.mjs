// Chalk Protocol — browser-spec gate (folds chalk-browser's headless test runner into verify).
// A task can lock a `.chalk/tests/<slug>.test.yaml` spec as an acceptance test; the BYO
// `protocol.e2e.command` (e.g. chalk-browser's run-spec CLI) runs it, exit 0=pass/1=fail, and
// writes run.json evidence under `.chalk/runs/<specId>/<runId>/` — the SAME store chalk-browser
// reads, so boards can show one authoritative testArtifact. Zero dependencies.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withRunner } from './config.mjs';
import { id } from './store.mjs';

export const isSpec = (p) => typeof p === 'string' && p.endsWith('.test.yaml');

// Read a spec's top-level `id:` from the YAML (zero-dep; the id is an unquoted/quoted scalar).
export function readSpecId(cwd, specPath) {
  try {
    const m = readFileSync(join(cwd, specPath), 'utf8').match(/^id:\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
  } catch { return null; }
}

// Find the most recent run.json for a spec under <runsDir>/<specId>/*/run.json (latest startedAt).
export function latestRun(cwd, runsDir, specId) {
  const base = join(cwd, runsDir, specId);
  if (!existsSync(base)) return null;
  let best = null;
  for (const sub of readdirSync(base)) {
    try {
      const r = JSON.parse(readFileSync(join(base, sub, 'run.json'), 'utf8'));
      if (!best || (r.startedAt || 0) > (best.startedAt || 0)) best = r;
    } catch { /* skip non-run dirs / corrupt json */ }
  }
  return best;
}

// Run the given specs via the BYO e2e command in `cwd`. Each spec gets a fresh out dir so the
// run.json lands where chalk-browser's evidence reader expects it. Returns
// [{ path, specId, runId, status, runDir }]. A spec with no specId or no command is skipped.
export function runSpecs(store, cwd, specPaths) {
  const e2e = store.protocol().e2e || {};
  const runner = store.protocol().runner;
  const out = [];
  if (!e2e.command) return out;
  for (const path of specPaths.filter(isSpec)) {
    const specId = readSpecId(cwd, path) || path.replace(/[^a-z0-9]+/gi, '-');
    const runId = id('run');
    const runDir = join(e2e.runsDir || '.chalk/runs', specId, runId);
    mkdirSync(join(cwd, runDir), { recursive: true });
    const base = e2e.baseUrl ? ` --base-url ${e2e.baseUrl}` : '';
    let status = 'failed';
    try {
      execSync(`${withRunner(runner, e2e.command)} --spec ${path} --out ${runDir}${base}`, { cwd, stdio: 'inherit', timeout: 10 * 60 * 1000 });
      status = 'passed';
    } catch { status = 'failed'; }
    // Prefer the runner's own verdict from run.json if it wrote one.
    try { const r = JSON.parse(readFileSync(join(cwd, runDir, 'run.json'), 'utf8')); if (r.status) status = r.status; } catch { /* keep exit-code verdict */ }
    out.push({ path, specId, runId, status, runDir });
  }
  return out;
}
