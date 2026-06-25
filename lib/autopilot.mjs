// Chalk Protocol — the scheduled-run unit. This is what a cron / launchd / `/loop` schedule
// should call: a SAFE single sweep of the autonomous pipeline. It (1) takes a lock so overlapping
// scheduled runs can't stomp each other, (2) runs `chalk doctor` and ABORTS if the repo isn't
// ready (no executor, gh not authed, a testless task with no reviewer backstop, …), and only then
// (3) drives `chalk pipeline` for up to N tasks. The gates remain the only safety; this just makes
// scheduling the loop survivable. Zero dependencies.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runDoctor } from './doctor.mjs';
import { runPipeline } from './pipeline.mjs';
import { now } from './store.mjs';

const STALE_MS = 2 * 60 * 60 * 1000; // a held lock older than this is treated as stale (crashed run)

export function runAutopilot(store, cliPath, { max = 3, retro = true, log = () => {} } = {}) {
  const dir = join(store.root, '.chalk', 'local'); // gitignored runtime state
  const lock = join(dir, 'autopilot.lock');
  mkdirSync(dir, { recursive: true });

  // 1. Single-flight: skip if a fresh lock is held.
  if (existsSync(lock)) {
    const at = Date.parse(readFileSync(lock, 'utf8').trim()) || 0;
    if (Date.now() - at < STALE_MS) return { skipped: 'locked' };
  }
  writeFileSync(lock, now());
  try {
    // 2. Preflight — never drive an unready repo unattended.
    const fails = runDoctor(store).filter((d) => d.level === 'fail');
    if (fails.length) { fails.forEach((f) => log(`not ready: ${f.msg}`)); return { notReady: true, fails: fails.map((f) => f.msg) }; }
    // 3. One bounded sweep of the pipeline.
    const r = runPipeline(store, cliPath, { max, log });
    // 4. Self-heal: a retrospective that distills lessons + files improvement issues for next time.
    if (retro && store.protocol().retro?.command) { log('retro: distilling lessons + filing issues'); spawnSync('node', [cliPath, 'retro'], { cwd: store.root, encoding: 'utf8' }); }
    return { ran: true, merged: r.merged || [], blocked: r.blocked || [] };
  } finally {
    try { rmSync(lock); } catch { /* best-effort */ }
  }
}
