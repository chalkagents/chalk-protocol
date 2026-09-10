// Resolve one review candidate. Never substitute a historical commit for an empty change.
import { createHash } from 'node:crypto';
import { realpathSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { launchCommand } from './process.mjs';
import { SPINE_STATE_PATHS } from './store.mjs';

function git(root, args, allowed = [0], input) {
  const r = launchCommand('git', ['--no-replace-objects', '--no-optional-locks', '-c', 'diff.autoRefreshIndex=false', '-c', 'core.warnAmbiguousRefs=true', ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' },
  });
  if (/refname .* is ambiguous|short object ID .* is ambiguous/i.test(r.stderr || '')) {
    const error = new Error('ambiguous review base ref; use a qualified refs/heads/ or refs/tags/ name, or a full commit ID');
    error.code = 'AMBIGUOUS_REF'; throw error;
  }
  if (r.error || !allowed.includes(r.status) || r.status === 1 && !r.stdout?.trim()) throw new Error(`git ${args[0]} failed: ${r.error?.message || r.stderr || `exit ${r.status}`}`);
  return r.stdout || '';
}
const query = (root, args) => { try { return git(root, args).trim(); } catch (error) { if (error.code === 'AMBIGUOUS_REF') throw error; return ''; } };
const commit = (root, ref) => query(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
const list = output => output.split('\0').filter(Boolean);
const hash = value => createHash('sha256').update(value).digest('hex');
function contentIdentity(root, path) {
  try {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) if (lstatSync(resolve(root, ...parts.slice(0, i))).isSymbolicLink()) throw new Error('symlinked review input directory');
    const absolute = resolve(root, path), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return { path, link: readlinkSync(absolute) };
    if (!stat.isFile()) throw new Error(`unsupported review input ${JSON.stringify(path)}`);
    return { path, content: hash(readFileSync(absolute)), executable: stat.mode & 0o111 };
  } catch (error) { if (error.code === 'ENOENT') return { path, deleted: true }; throw error; }
}
export const isReviewGitTree = root => query(root, ['rev-parse', '--is-inside-work-tree']) === 'true';

export function pinReviewBase(root, ref) {
  if (!isReviewGitTree(root)) {
    if (ref !== undefined) throw new Error('review --base requires a Git worktree');
    return undefined;
  }
  if (ref !== undefined && (typeof ref !== 'string' || !ref.trim())) throw new Error('review --base requires a commit or ref');
  const oid = commit(root, ref ?? 'HEAD');
  if (!oid && ref !== undefined) throw new Error(`cannot resolve review base ${JSON.stringify(ref)}`);
  // null is only recorded at task start in a repository with no commits.
  if (!oid && query(root, ['rev-parse', '--verify', 'HEAD'])) throw new Error('cannot identify task starting revision');
  return { commit: oid || null, capturedAt: new Date().toISOString(), source: ref === undefined ? 'task-start' : 'explicit', ref: ref ?? 'HEAD' };
}

function baseFor(root, task, configuredBase, head) {
  if (task.reviewBase) {
    const oid = task.reviewBase.commit;
    if (oid === null && task.reviewBase.source === 'task-start') return git(root, ['hash-object', '-t', 'tree', '--stdin']).trim();
    if (typeof oid !== 'string' || !/^[a-f0-9]{40,64}$/.test(oid) || commit(root, oid) !== oid) throw new Error('recorded task base is unavailable');
    if (!head || query(root, ['merge-base', oid, head]) !== oid) throw new Error('recorded task base is not an ancestor of HEAD');
    return oid;
  }
  if (!head) throw new Error('missing task base in an unborn repository; run chalk start before implementation');
  // Compatibility for existing feature branches: accept only a unique merge base.
  const refs = configuredBase ? [configuredBase, `refs/remotes/origin/${configuredBase}`] : [];
  const bases = [...new Set(refs.map(ref => commit(root, ref)).filter(Boolean).flatMap(oid => list(git(root, ['merge-base', '--all', oid, head]).replaceAll('\n', '\0'))))];
  if (bases.length !== 1) throw new Error(bases.length ? 'ambiguous task base (local and remote histories disagree)' : 'missing task base');
  return bases[0];
}

export function legacyReviewBase(root, task, protocol = {}) {
  if (task.reviewBase || !isReviewGitTree(root)) return task.reviewBase;
  return { commit: baseFor(root, task, protocol.github?.base, commit(root, 'HEAD')), source: 'legacy', capturedAt: new Date().toISOString(), ref: protocol.github?.base };
}

export function captureReviewInputs(root, task, protocol = {}) {
  if (!isReviewGitTree(root)) return { mode: 'source-inspection', cwd: realpathSync(root), diff: '', files: [], untracked: [] };
  const head = commit(root, 'HEAD') || null;
  const branch = query(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || '(detached)';
  const base = baseFor(root, task, protocol.github?.base, head);
  const protectedDir = relative(root, resolve(root, String(protocol.regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir()))).split('\\').join('/');
  const excludes = [...SPINE_STATE_PATHS, '.chalk/local', '.chalk/.lock', '.chalk/.locks', '.chalk/held-out', ...(protectedDir && !protectedDir.startsWith('../') ? [protectedDir] : [])];
  const paths = ['--', '.', ...excludes.map(p => `:(literal,exclude)${p}`), ':(glob,exclude)**/.chalk/held-out/**'];
  const diffOptions = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--ignore-submodules=none', '--relative'];
  // Only inspect index metadata. Exclusions must not hide unresolved conflicts,
  // including in another subdirectory or protected content whose bytes stay unread.
  if (git(root, ['ls-files', '-u', '-z', '--', ':/'])) throw new Error('unresolved merge conflicts; resolve the index before review');
  // Inspect attributes before diff can invoke a clean filter. These conversions
  // can erase runtime-significant source while Git reports an unchanged file.
  const visible = list(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', ...paths]));
  if (visible.length) {
    const attributes = git(root, ['check-attr', '-z', '--stdin', 'filter', 'working-tree-encoding', 'ident', 'text', 'eol'], [0], visible.join('\0') + '\0').split('\0').slice(0, -1);
    const autocrlf = query(root, ['config', '--get', 'core.autocrlf']);
    const normalization = new Set(autocrlf && autocrlf !== 'false' ? visible : []);
    for (let i = 0; i < attributes.length; i += 3) {
      const [path, attr, value] = attributes.slice(i, i + 3);
      if (value === 'unspecified' || value === 'unset') continue;
      if (['filter', 'working-tree-encoding', 'ident'].includes(attr)) throw new Error(`Git content transformation ${attr} on ${JSON.stringify(path)} is unsupported; review requires effective source bytes without clean filters, encoding conversion or ident expansion`);
      normalization.add(path);
    }
    for (const path of normalization) {
      contentIdentity(root, path); // reject symlinked parents before reading bytes
      const absolute = resolve(root, path);
      try { if (lstatSync(absolute).isFile() && readFileSync(absolute).includes(Buffer.from('\r\n'))) throw new Error(`Git line-ending normalization on ${JSON.stringify(path)} can hide effective source bytes; normalize the working file before review`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const submodules = list(git(root, ['ls-files', '--stage', '-z', ...paths])).filter(entry => entry.startsWith('160000 ')).map(entry => entry.slice(entry.indexOf('\t') + 1));
  const raw = list(git(root, ['diff', ...diffOptions, '--raw', '-z', base, ...paths]));
  for (let i = 0; i < raw.length; i += 2) if (/^:(?:160000 [0-7]+|[0-7]+ 160000) /.test(raw[i])) submodules.push(raw[i + 1]);
  if (submodules.length) throw new Error(`submodule review inputs are unsupported: ${JSON.stringify(submodules)}; use a task rooted in the submodule repository or add recursive capture support before reviewing this repository`);
  for (const flag of ['-v', '-f']) {
    const flagged = list(git(root, ['ls-files', flag, '-z', ...paths])).filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
    if (flagged.length) throw new Error(`index flags can hide changes in ${JSON.stringify(flagged)}; clear them with git update-index --no-assume-unchanged, --no-skip-worktree and --no-fsmonitor-valid for each affected path`);
  }
  const untracked = list(git(root, ['ls-files', '--others', '--exclude-standard', '-z', ...paths])).sort();
  const staged = new Set(list(git(root, ['diff', ...diffOptions, '--cached', '--name-only', '-z', ...paths])));
  const overlapping = list(git(root, ['diff', ...diffOptions, '--name-only', '-z', ...paths])).filter(path => staged.has(path));
  if (overlapping.length) throw new Error(`staged and working versions conflict in ${JSON.stringify(overlapping)}; stage the intended full file or unstage its partial changes before review`);
  const tracked = list(git(root, ['diff', ...diffOptions, '--name-only', '-z', base, ...paths]));
  let diff = git(root, ['diff', ...diffOptions, '--binary', base, ...paths]);
  for (const path of untracked) diff += git(root, ['diff', ...diffOptions, '--binary', '--no-index', '--', '/dev/null', path], [0, 1]);
  const files = [...new Set([...tracked, ...untracked])].sort();
  const manifest = { version: 1, mode: 'git', cwd: realpathSync(root), branch, base, head, files, untracked };
  const contentFingerprint = hash(JSON.stringify({ base, files: files.map(path => contentIdentity(root, path)) }));
  return { ...manifest, contentFingerprint, fingerprint: hash(JSON.stringify(manifest) + contentFingerprint + '\n' + diff), diff };
}

export function formatReviewInputs(input) {
  if (input.mode !== 'git') return `Review source inspection in ${JSON.stringify(input.cwd)} (no Git revision).`;
  return `Review inputs\nExecution directory: ${JSON.stringify(input.cwd)}\nBranch: ${JSON.stringify(input.branch)}\nTask base: ${input.base}\nHEAD: ${input.head || '(unborn)'}\nContent fingerprint: ${input.fingerprint}\nComplete changed-file list: ${JSON.stringify(input.files)}\nUntracked files (included): ${JSON.stringify(input.untracked)}`;
}
