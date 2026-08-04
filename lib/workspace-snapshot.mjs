// Net workspace mutation detection for read-only roles. It records content hashes only, never
// restores or deletes files. The held-out directory is excluded from reads by construction.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIR = new Set(['.git', 'node_modules']);
const heldOut = (path) => path === '.chalk/held-out' || path.startsWith('.chalk/held-out/');
const skipped = (path) => heldOut(path) || path.split('/').some((part) => SKIP_DIR.has(part));
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fileHash(root, path) {
  if (skipped(path)) return null;
  const abs = join(root, path);
  try {
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) return hash(`link:${readlinkSync(abs)}`);
    if (!stat.isFile()) return null;
    return hash(readFileSync(abs));
  } catch { return '<unreadable>'; }
}

function gitPaths(root) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return null;
  // Git is the index for tracked, ordinary-untracked, and ignored files. Exclusion pathspecs keep
  // large/private trees out of enumeration; the final filter also protects tracked exceptions.
  const exclusions = [
    ':(exclude,glob)**/.git/**',
    ':(exclude,glob)**/node_modules/**',
    ':(exclude,glob).chalk/held-out/**',
  ];
  const runs = [
    spawnSync('git', ['ls-files', '--cached', '-z', '--', '.', ...exclusions], { cwd: root, encoding: 'utf8' }),
    spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ...exclusions], { cwd: root, encoding: 'utf8' }),
    spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', '.', ...exclusions], { cwd: root, encoding: 'utf8' }),
  ];
  return new Set(runs.flatMap((r) => String(r.stdout || '').split('\0').filter((path) => path && !skipped(path))));
}

function walk(root) {
  const paths = new Set();
  const visit = (dir) => {
    let entries = []; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split('\\').join('/');
      if (heldOut(rel)) continue;
      if (entry.isDirectory()) { if (!SKIP_DIR.has(entry.name)) visit(abs); }
      else paths.add(rel);
    }
  };
  visit(root);
  return paths;
}

export function workspaceSnapshot(root) {
  const paths = gitPaths(root) || walk(root);
  const files = {};
  for (const path of paths) {
    const digest = fileHash(root, path);
    if (digest !== null) files[path] = digest;
  }
  return files;
}

export function snapshotChanges(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((path) => before?.[path] !== after?.[path]).sort();
}
