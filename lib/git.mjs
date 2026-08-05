// Chalk Protocol — git + GitHub (BYO `gh`) helpers for the issue→merge pipeline.
// Mirrors the execSync BYO pattern used by verify/review/run: tolerant, 10-min timeout, the
// command is configurable (protocol.github.command, default "gh"). Zero dependencies.
import { commandWords, launchCommand } from './process.mjs';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const TIMEOUT = 10 * 60 * 1000;

// Run a git command in `cwd`; returns trimmed stdout. Throws on failure (callers decide tolerance).
// `timeout` is bounded so network probes (ls-remote) can't hang a fast preflight.
export function git(cwd, args, { input, timeout = TIMEOUT } = {}) {
  const result = launchCommand('git', commandWords(args), { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout });
  if (result.error || result.status !== 0) throw subprocessError('git', result);
  return String(result.stdout || '').trim();
}

// Tolerant git: returns '' instead of throwing (for queries like "does this branch exist?").
export function gitTry(cwd, args, opts) {
  try { return git(cwd, args, opts); } catch { return ''; }
}

// Run the BYO GitHub CLI (default `gh`). `ghCommand` comes from protocol.github.command.
// Returns trimmed stdout; throws on failure so the pipeline can block the task on a gh error.
export function gh(cwd, ghCommand, args, { input } = {}) {
  const command = [...commandWords(ghCommand || 'gh'), ...commandWords(args)];
  const [binary, ...argv] = command;
  const result = launchCommand(binary, argv, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT });
  if (result.error || result.status !== 0) throw subprocessError(binary, result);
  return String(result.stdout || '').trim();
}

function subprocessError(command, result) {
  const detail = [result.stderr, result.stdout, result.error?.message].filter(Boolean).map(String).join('\n').trim();
  const error = new Error(`Command failed: ${command}${detail ? `\n${detail}` : ''}`);
  error.status = result.status;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.cause = result.error;
  return error;
}

// Parse `owner/repo` from the origin remote URL (ssh or https; tolerant of the github.com-<alias>
// host form). Returns null if it can't be determined.
export function currentRepo(cwd) {
  const url = gitTry(cwd, 'remote get-url origin');
  if (!url) return null;
  // git@github.com:owner/repo.git | git@github.com-alias:owner/repo.git | https://github.com/owner/repo(.git)
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\s*$/);
  return m ? m[1] : null;
}

// True if a local branch already exists (idempotency check).
export function branchExists(cwd, branch) {
  return gitTry(cwd, `rev-parse --verify --quiet refs/heads/${branch}`) !== '';
}

// True if a worktree directory is currently registered with git. Compares realpaths so it's
// robust to `..` segments and symlinked temp dirs (git reports canonical paths).
export function worktreeExists(cwd, dir) {
  const key = (value) => {
    const path = realpathSync(value).split('\\').join('/').replace(/\/+$/, '');
    const stat = statSync(value);
    return {
      path: process.platform === 'win32' ? path.toLowerCase().replace(/^\/\/\?\//, '') : path,
      dev: String(stat.dev), ino: String(stat.ino),
    };
  };
  let target; try { target = key(dir); } catch { return false; }
  const same = (candidate) => candidate.path === target.path
    || (target.ino !== '0' && candidate.ino !== '0' && candidate.dev === target.dev && candidate.ino === target.ino);
  // Ask Git from inside the candidate first. This avoids Windows' short-vs-long pathname aliases
  // in `worktree list` while still proving the directory belongs to this repository's common dir.
  const top = gitTry(dir, ['rev-parse', '--show-toplevel']);
  const candidateCommon = gitTry(dir, ['rev-parse', '--git-common-dir']);
  const currentCommon = gitTry(cwd, ['rev-parse', '--git-common-dir']);
  if (top && candidateCommon && currentCommon) {
    try {
      const sameTop = same(key(top));
      const candidateGit = key(resolve(dir, candidateCommon));
      const currentGit = key(resolve(cwd, currentCommon));
      if (sameTop && (candidateGit.path === currentGit.path
        || (candidateGit.ino !== '0' && currentGit.ino !== '0' && candidateGit.dev === currentGit.dev && candidateGit.ino === currentGit.ino))) return true;
    } catch { /* fall through to the registry listing */ }
  }
  return gitTry(cwd, 'worktree list --porcelain').split(/\r?\n/)
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice(9))
    .some((p) => {
      try {
        const candidate = key(p);
        return same(candidate);
      } catch { return false; }
    });
}

// Add a worktree for `branch` at `dir`, creating the branch off `base` if it doesn't exist.
// Idempotent: a no-op if the worktree is already present. Returns the absolute dir.
export function worktreeAdd(cwd, { dir, branch, base = 'main' }) {
  if (worktreeExists(cwd, dir)) return dir;
  // Clear stale metadata first: if a previous worktree dir was removed out-of-band, git still thinks
  // the branch is checked out there and would refuse `worktree add <branch>` — prune frees it.
  gitTry(cwd, 'worktree prune');
  if (branchExists(cwd, branch)) git(cwd, ['worktree', 'add', dir, branch]);
  else git(cwd, ['worktree', 'add', dir, '-b', branch, base]);
  return dir;
}

// Remove a worktree and (optionally) delete its local branch. Idempotent + tolerant — cleanup
// must never throw and strand the pipeline.
export function worktreeRemove(cwd, { dir, branch } = {}) {
  if (dir && worktreeExists(cwd, dir)) gitTry(cwd, ['worktree', 'remove', dir, '--force']);
  gitTry(cwd, 'worktree prune');
  if (branch && branchExists(cwd, branch)) gitTry(cwd, ['branch', '-D', branch]);
}

// Stage specific paths (never `git add -A`). No-op on an empty list.
export function gitAdd(cwd, paths) {
  if (paths.length) git(cwd, ['add', '--', ...paths]);
}

// Commit with one or more `-m` messages (subject + optional body lines).
export function gitCommit(cwd, messages) {
  git(cwd, ['commit', ...messages.filter(Boolean).flatMap((m) => ['-m', m])]);
}

// Commit ONLY the given paths: `git commit -- <pathspec>` takes the working-tree state of exactly
// those paths and leaves any OTHER staged changes untouched — so an automated commit (e.g. intake's
// chore(spine)) can never sweep a user's unrelated pre-staged work into it. Returns whether it ran
// (skips when none of the paths have changes vs HEAD, avoiding an empty-commit error).
export function gitCommitPaths(cwd, message, paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return false;
  if (!gitTry(cwd, ['status', '--porcelain', '--', ...list]).trim()) return false;
  // Stage these paths first so UNTRACKED ones (e.g. a fresh boards/ dir) are included — `git commit
  // -- <pathspec>` alone errors on paths git doesn't yet know. The pathspec on commit then makes it a
  // PARTIAL commit: only these paths land; any other staged file stays staged (the safety guarantee).
  git(cwd, ['add', '--', ...list]);
  git(cwd, ['commit', '-m', message, '--', ...list]);
  return true;
}

// Files the branch CHANGED vs its base — the committed diff (three-dot: since divergence). Unlike
// changedPaths (uncommitted working tree), this is what a PR actually contains, used to record the
// change set in the PR body. Empty list on any failure (detached/unknown base).
export function diffPaths(cwd, base = 'main') {
  return gitTry(cwd, `diff --name-only ${base}...HEAD`).split(/\r?\n/).filter(Boolean);
}

// Changed (modified + untracked) paths in the working tree, from `git status --porcelain`.
// Strip the 1–2 char status code + space robustly: git()'s .trim() removes the leading space of
// the FIRST porcelain line (` M f` → `M f`), so a fixed slice(3) would eat a path char.
export function changedPaths(cwd) {
  // `-uall` lists every untracked FILE individually instead of collapsing a brand-new directory to
  // `dir/` — so callers see `test/foo_test.js`, not `test/` (the test-enforcement gate and the commit
  // stage both need the real paths).
  return gitTry(cwd, 'status --porcelain -uall').split(/\r?\n/).filter(Boolean).map((l) => l.replace(/^\s*\S{1,2}\s+/, '').replace(/^"|"$/g, ''));
}
