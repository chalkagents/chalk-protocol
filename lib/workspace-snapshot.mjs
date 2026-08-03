// Net workspace mutation detection for read-only roles. It records content hashes only, never
// restores or deletes files. The held-out directory is excluded from reads by construction.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIR = new Set(['.git', 'node_modules']);
const heldOut = (path) => path === '.chalk/held-out' || path.startsWith('.chalk/held-out/');
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fileHash(root, path) {
  if (heldOut(path)) return null;
  const abs = join(root, path);
  if (!existsSync(abs)) return '<deleted>';
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
  const runs = [
    spawnSync('git', ['diff', '--name-only', '-z', 'HEAD', '--', '.'], { cwd: root, encoding: 'utf8' }),
    spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }),
  ];
  return new Set(runs.flatMap((r) => String(r.stdout || '').split('\0').filter(Boolean)));
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
