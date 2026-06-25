// Chalk Protocol — preflight readiness check for autonomous operation. READ-ONLY: it never
// edits the tree or calls a write API; it only inspects config, git, gh, and the backlog and
// reports what would make an unattended `chalk run`/`chalk pipeline` unsafe or vacuous. The
// single most important signal is "a runnable task with no locked test" — verify would pass
// vacuously, so autonomy would rubber-stamp empty work. Zero dependencies.
import { existsSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { runnableTasks } from './store.mjs';
import { currentRepo, gitTry } from './git.mjs';
import { isSpec } from './e2e.mjs';
import { reviewCadences } from './config.mjs';
import { execSync } from 'node:child_process';

const onPath = (cmd) => { const bin = String(cmd || '').trim().split(/\s+/)[0]; if (!bin) return false; try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; } catch { return false; } };
const ghAuthed = (ghCmd) => { try { execSync(`${ghCmd || 'gh'} auth status`, { stdio: 'ignore', timeout: 30000 }); return true; } catch { return false; } };

// Returns [{ area, level: 'ok'|'warn'|'fail', msg }]. The caller renders + decides the exit code.
export function runDoctor(store) {
  const out = [];
  const add = (area, level, msg) => out.push({ area, level, msg });
  const proto = store.protocol();
  const gh0 = proto.github || {};

  // --- toolchain ---
  add('toolchain', onPath('git') ? 'ok' : 'fail', onPath('git') ? 'git on PATH' : 'git not found on PATH');
  add('toolchain', onPath(gh0.command || 'gh') ? 'ok' : 'fail', `${gh0.command || 'gh'} ${onPath(gh0.command || 'gh') ? 'on PATH' : 'not found on PATH'}`);
  const isRepo = gitTry(store.root, 'rev-parse --is-inside-work-tree') === 'true';
  add('toolchain', isRepo ? 'ok' : 'fail', isRepo ? 'inside a git work tree' : 'not a git repository (run `git init`)');

  // --- github ---
  if (isRepo) {
    const repo = currentRepo(store.root);
    add('github', repo ? 'ok' : 'warn', repo ? `repo ${repo}` : 'no origin remote — pipeline/PR stages need one');
    add('github', ghAuthed(gh0.command) ? 'ok' : 'fail', ghAuthed(gh0.command) ? 'gh authenticated' : 'gh not authenticated (run `gh auth login`)');
    const base = gh0.base || 'main';
    const hasBase = gitTry(store.root, `ls-remote --heads origin ${base}`) !== '';
    add('github', hasBase ? 'ok' : 'warn', hasBase ? `base branch origin/${base} exists` : `base branch origin/${base} not found on the remote`);
  }

  // --- executor (required for run/pipeline to write code) ---
  add('executor', proto.executor?.command ? 'ok' : 'fail',
    proto.executor?.command ? `executor: ${proto.executor.command}` : 'no protocol.executor.command — the loop cannot write code');

  // --- gates wired ---
  const cadences = reviewCadences(proto.review || {});
  if (cadences.length && !proto.review?.command) add('gates', 'warn', `review cadence ${JSON.stringify(cadences)} set but review.command is empty`);
  const tasks = store.tasks();
  const hasSpecTests = tasks.some((t) => (t.tests || []).some((x) => isSpec(x.path)));
  if (hasSpecTests && !proto.e2e?.command) add('gates', 'warn', 'a task locks a .test.yaml but protocol.e2e.command is empty (the spec gate is skipped)');
  if (proto.regression?.required && !(proto.regression.tests?.length || proto.regression.command)) add('gates', 'warn', 'regression.required but no held-out tests/command configured');

  // --- backlog quality: the make-or-break check ---
  const runnable = runnableTasks(tasks);
  const testless = runnable.filter((t) => !(t.tests || []).length);
  if (!tasks.length) add('backlog', 'warn', 'no tasks yet');
  else if (testless.length) for (const t of testless) add('backlog', 'fail', `runnable task "${t.title}" has NO locked test — verify would pass vacuously`);
  else if (runnable.length) add('backlog', 'ok', `${runnable.length} runnable task(s), all with locked tests`);

  // --- isolation ---
  if (proto.worktree?.enabled !== false) {
    const dir = resolve(store.root, proto.worktree?.dir || '..');
    let writable = false; try { accessSync(dir, constants.W_OK); writable = existsSync(dir); } catch { writable = false; }
    add('isolation', writable ? 'ok' : 'warn', `worktree dir ${dir} ${writable ? 'writable' : 'not writable/missing'}`);
  }

  return out;
}
