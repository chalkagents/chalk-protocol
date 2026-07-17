// Chalk Protocol — preflight readiness check for autonomous operation. READ-ONLY: it never
// edits the tree or calls a write API; it only inspects config, git, gh, and the backlog and
// reports what would make an unattended `chalk run`/`chalk pipeline` unsafe or vacuous. The
// single most important signal is "a runnable task with no locked test" — verify would pass
// vacuously, so autonomy would rubber-stamp empty work. Zero dependencies.
import { existsSync, accessSync, constants } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { runnableTasks, spineSkew } from './store.mjs';
import { currentRepo, gitTry } from './git.mjs';
import { isSpec } from './e2e.mjs';
import { reviewCadences, sameModelFamily, normGate } from './config.mjs';
import { execSync } from 'node:child_process';

const onPath = (cmd) => { const bin = String(cmd || '').trim().split(/\s+/)[0]; if (!bin) return false; try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; } catch { return false; } };
const ghAuthed = (ghCmd) => { try { execSync(`${ghCmd || 'gh'} auth status`, { stdio: 'ignore', timeout: 30000 }); return true; } catch { return false; } };

// Per-OS install hint for a missing binary — a stranger's doctor run should end in a copy-paste
// fix, not a search. Pure (platform injectable) so it's testable on any host.
export function installHint(bin, platform = process.platform) {
  const b = String(bin || '').trim().split(/\s+/)[0];
  const hints = {
    gh: { darwin: 'brew install gh', win32: 'winget install GitHub.cli', linux: 'https://github.com/cli/cli#installation' },
    git: { darwin: 'xcode-select --install (or brew install git)', win32: 'winget install Git.Git', linux: 'install git via your package manager (apt/dnf/pacman)' },
  };
  const h = hints[b];
  if (!h) return '';
  return `install: ${h[platform] || h.linux}`;
}

// Returns [{ area, level: 'ok'|'warn'|'fail', msg }]. The caller renders + decides the exit code.
export function runDoctor(store) {
  const out = [];
  const add = (area, level, msg) => out.push({ area, level, msg });
  const proto = store.protocol();

  // Version skew (#159): a spine written by a NEWER chalk than this binary is unsafe to operate on
  // (fail — upgrade); an OLDER schema should be carried forward with `chalk migrate` (warn). Guarded
  // so a meta-less test stub is a no-op.
  const meta = store.meta ? store.meta() : null;
  if (meta) {
    const skew = spineSkew(meta);
    if (skew.status === 'newer') add('spine', 'fail', `spine was written by chalk-protocol ${skew.writer} but you are running ${skew.running} — upgrade: npm i -g chalk-protocol@latest`);
    else if (skew.status === 'needs-migrate') add('spine', 'warn', `spine schema ${skew.from} < current ${skew.to} — run \`chalk migrate\` (backs up first, then upgrades in place)`);
  }
  const gh0 = proto.github || {};

  // --- toolchain ---
  const ghCmd = gh0.command || 'gh';
  const gitOk = onPath('git'), ghOnPath = onPath(ghCmd);
  const withHint = (msg, bin) => { const h = installHint(bin); return h ? `${msg} — ${h}` : msg; }; // no dangling em-dash for custom commands
  add('toolchain', gitOk ? 'ok' : 'fail', gitOk ? 'git on PATH' : withHint('git not found on PATH', 'git'));
  add('toolchain', ghOnPath ? 'ok' : 'fail', ghOnPath ? `${ghCmd} on PATH` : `${withHint(`${ghCmd} not found on PATH`, ghCmd)} (needed for the issue/PR pipeline, NOT for the local loop)`);
  const isRepo = gitTry(store.root, 'rev-parse --is-inside-work-tree') === 'true';
  add('toolchain', isRepo ? 'ok' : 'fail', isRepo ? 'inside a git work tree' : 'not a git repository (run `git init`)');

  // --- github ---
  if (isRepo) {
    const repo = currentRepo(store.root);
    add('github', repo ? 'ok' : 'warn', repo ? `repo ${repo}` : 'no origin remote — pipeline/PR stages need one');
    const authed = ghAuthed(gh0.command);
    add('github', authed ? 'ok' : 'fail', authed ? 'gh authenticated' : 'gh not authenticated (run `gh auth login`)');
    const base = gh0.base || 'main';
    const hasBase = gitTry(store.root, `ls-remote --heads origin ${base}`, { timeout: 15000 }) !== ''; // bounded — no 10-min hang
    add('github', hasBase ? 'ok' : 'warn', hasBase ? `base branch origin/${base} exists` : `base branch origin/${base} not found on the remote`);
  }

  // --- executor (required for run/pipeline to write code; the MANUAL loop needs none) ---
  add('executor', proto.executor?.command ? 'ok' : 'fail',
    proto.executor?.command ? `executor: ${proto.executor.command}`
      : 'no protocol.executor.command — required for `chalk run`/`chalk pipeline`; OPTIONAL for the manual loop (chalk next → write code → chalk verify → chalk done), which works without one');

  // --- gates wired ---
  const cadences = reviewCadences(proto.review || {});
  if (cadences.length && !proto.review?.command) add('gates', 'warn', `review cadence ${JSON.stringify(cadences)} set but review.command is empty`);
  // P5 only works as an oversight gate if the reviewer is INDEPENDENT of the author. A reviewer on the
  // same model as the executor self-prefers and shares its blind spots — flag it so autonomy isn't graded
  // by a clone of itself. Conservative: only when review is actually required and the models clearly match.
  if (cadences.length && proto.executor?.command && proto.review?.command && sameModelFamily(proto.executor.command, proto.review.command))
    add('gates', 'warn', 'P5 reviewer uses the same model as the executor — cross-family review catches self-preference bias / correlated blind spots; set a different --model (or tool) for protocol.review.command');
  const tasks = store.tasks();
  const hasSpecTests = tasks.some((t) => (t.tests || []).some((x) => isSpec(x.path, proto.e2e?.specPattern)));
  if (hasSpecTests && !proto.e2e?.command) add('gates', 'warn', `a task locks a browser spec (${proto.e2e?.specPattern || '.test.yaml'}) but protocol.e2e.command is empty (the spec gate is skipped)`);
  if (proto.regression?.required && !(proto.regression.tests?.length || proto.regression.command)) add('gates', 'warn', 'regression.required but no held-out tests/command configured');
  // Adoption nudge (info, not a warning): the strongest levers are opt-in, so a default setup runs
  // the weakest configuration chalk supports — say which ones are off and where to arm them.
  const off = [
    !proto.breakTest && 'breakTest (non-vacuity probe)',
    !proto.mutation && 'mutation (test-adequacy)',
    !(proto.regression?.command || proto.regression?.tests?.length) && 'held-out regression (P7)',
    !cadences.length && 'adversarial review (P5)',
    !proto.plan?.required && 'plan-approval checkpoint',
  ].filter(Boolean);
  if (off.length) add('gates', 'info', `opt-in levers OFF: ${off.join(', ')} — arm them in .chalk/chalk.json (see PROTOCOL.md → levers)`);

  // --- backlog quality: the make-or-break check ---
  // A runnable task with no locked test means verify could pass vacuously. That's a BLOCKER —
  // unless an adversarial reviewer gate is configured, which is the backstop that catches a
  // change shipped without a real test (then it's only a WARNING).
  const reviewerGate = !!proto.review?.command && reviewCadences(proto.review).length > 0;
  const runnable = runnableTasks(tasks);
  const testless = runnable.filter((t) => !(t.tests || []).length);
  if (!tasks.length) add('backlog', 'warn', 'no tasks yet');
  else if (testless.length) for (const t of testless) add('backlog', reviewerGate ? 'warn' : 'fail', `runnable task "${t.title}" has no locked test — relying on the reviewer gate${reviewerGate ? '' : ' (none configured → verify would pass vacuously)'}`);
  else if (runnable.length) add('backlog', 'ok', `${runnable.length} runnable task(s), all with locked tests`);

  // A configured verify is what makes P4 real. If protocol.verify has NO gate at all, `chalk verify`
  // prints GREEN while running NOTHING — so even a runnable task WITH a locked test auto-passes P4 (the
  // test is never executed). The per-task check above only catches testless tasks; this catches the
  // root cause the init-time warning doesn't enforce (#152). Blocks autonomous runs (autopilot gates on
  // fails); a reviewer gate is the backstop that can still catch an untested change, so it's a warning then.
  const verifyConfigured = Object.values(proto.verify || {}).some((v) => normGate(v).cmd);
  if (runnable.length && !verifyConfigured)
    add('gates', reviewerGate ? 'warn' : 'fail', `protocol.verify is empty — \`chalk verify\` passes VACUOUSLY (runs nothing), so ${runnable.length} runnable task(s) auto-pass P4${reviewerGate ? ' (relying on the reviewer gate)' : ' with no real test ever run'}. Set protocol.verify.test in .chalk/chalk.json (or re-init with \`chalk init --verify-test "<cmd>"\`).`);

  // --- isolation ---
  if (proto.worktree?.enabled !== false) {
    const dir = resolve(store.root, proto.worktree?.dir || '..');
    let writable = false; try { accessSync(dir, constants.W_OK); writable = existsSync(dir); } catch { writable = false; }
    add('isolation', writable ? 'ok' : 'warn', `worktree dir ${dir} ${writable ? 'writable' : 'not writable/missing'}`);
    // A fresh worktree has no resolved toolchain (no .dart_tool/, node_modules, venv). If a verify
    // command implies one and no worktree.setup bootstrap is configured, verify will fail before it
    // tests anything. Node (`node --test`) needs nothing, hence chalk's self-hosting never hit this.
    if (!proto.worktree?.setup) {
      const cmds = Object.values(proto.verify || {}).map((v) => (v && v.cmd) || v).filter((x) => typeof x === 'string').join(' ');
      if (/\b(flutter|dart|pub|npm|yarn|pnpm|jest|vitest|go +test|pytest|cargo|bundle|mvn|gradle)\b/.test(cmds))
        add('isolation', 'warn', 'verify implies a toolchain but protocol.worktree.setup is empty — a fresh worktree may lack resolved packages; set it (e.g. "flutter pub get" / "npm ci")');
    }
  }

  // P7 blindness depends on the held-out set NEVER reaching the executor's sandbox. A git worktree is a
  // plain checkout, so any COMMITTED held-out file physically appears where the implementer works and can
  // read it — silently defeating the gate (ImpossibleBench: hide the tests → cheating ≈ 0; leak them → it
  // returns). Refuse a git-tracked held-out dir (README excepted); hard fail when worktrees are in play.
  if (isRepo) {
    const heldDir = String(proto.regression?.dir || '.chalk/held-out').replace(/\/+$/, '');
    const tracked = (gitTry(store.root, `ls-files ${heldDir}`) || '').split('\n')
      .map((s) => s.trim()).filter(Boolean).filter((p) => !/(^|\/)README\.md$/i.test(p));
    if (tracked.length) add('isolation', proto.worktree?.enabled !== false ? 'fail' : 'warn',
      `${tracked.length} held-out file(s) under ${heldDir} are git-tracked — a worktree is a plain checkout, so they leak into the agent's sandbox and defeat P7 blindness. gitignore ${heldDir}/ (keep README) and \`git rm --cached\` them`);
  }

  // Manual mode has no sandbox: the agent works in the primary checkout, so a held-out set INSIDE
  // the repo is physically readable no matter how it's gitignored. Recommend relocating it OUTSIDE
  // the repo (an absolute regression.dir) so blindness is enforced by the filesystem, not discipline (#82).
  if (proto.worktree?.enabled === false && (proto.regression?.command || proto.regression?.tests?.length)) {
    const rawDir = proto.regression?.dir || '.chalk/held-out';
    const outside = isAbsolute(rawDir) || rawDir.startsWith('~');
    if (!outside) add('isolation', 'info', `worktree isolation is off and the held-out set lives inside the repo (${rawDir}) — a manual-mode agent can read it. Move it outside the repo (e.g. regression.dir: "~/.chalk-held-out/<project>") so P7 blindness is enforced by the filesystem, not by discipline`);
  }

  return out;
}
