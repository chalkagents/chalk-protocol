// Chalk Protocol — git + GitHub (BYO `gh`) helpers for the issue→merge pipeline.
// Mirrors the execSync BYO pattern used by verify/review/run: tolerant, 10-min timeout, the
// command is configurable (protocol.github.command, default "gh"). Zero dependencies.
import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const TIMEOUT = 10 * 60 * 1000;

// Run a git command in `cwd`; returns trimmed stdout. Throws on failure (callers decide tolerance).
export function git(cwd, args, { input } = {}) {
  return execSync(`git ${args}`, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT }).trim();
}

// Tolerant git: returns '' instead of throwing (for queries like "does this branch exist?").
export function gitTry(cwd, args) {
  try { return git(cwd, args); } catch { return ''; }
}

// Run the BYO GitHub CLI (default `gh`). `ghCommand` comes from protocol.github.command.
// Returns trimmed stdout; throws on failure so the pipeline can block the task on a gh error.
export function gh(cwd, ghCommand, args, { input } = {}) {
  return execSync(`${ghCommand || 'gh'} ${args}`, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT }).trim();
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
  let target; try { target = realpathSync(dir); } catch { return false; }
  return gitTry(cwd, 'worktree list --porcelain').split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice(9))
    .some((p) => { try { return realpathSync(p) === target; } catch { return false; } });
}

// Add a worktree for `branch` at `dir`, creating the branch off `base` if it doesn't exist.
// Idempotent: a no-op if the worktree is already present. Returns the absolute dir.
export function worktreeAdd(cwd, { dir, branch, base = 'main' }) {
  if (worktreeExists(cwd, dir)) return dir;
  if (branchExists(cwd, branch)) git(cwd, `worktree add ${q(dir)} ${q(branch)}`);
  else git(cwd, `worktree add ${q(dir)} -b ${q(branch)} ${q(base)}`);
  return dir;
}

// Remove a worktree and (optionally) delete its local branch. Idempotent + tolerant — cleanup
// must never throw and strand the pipeline.
export function worktreeRemove(cwd, { dir, branch } = {}) {
  if (dir && worktreeExists(cwd, dir)) gitTry(cwd, `worktree remove ${q(dir)} --force`);
  gitTry(cwd, 'worktree prune');
  if (branch && branchExists(cwd, branch)) gitTry(cwd, `branch -D ${q(branch)}`);
}

// Minimal shell-safe single-quoting for paths/refs.
function q(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
