// Local verification receipts. Logs are never copied into the versioned spine or sent remotely.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fsAsync from 'node:fs/promises';
import { lstatSync, readFileSync, readlinkSync, readdirSync, mkdirSync, writeFileSync, renameSync, realpathSync, openSync, readSync, writeSync, closeSync, copyFileSync, rmSync, fstatSync, constants } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { workdir } from './store.mjs';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const slash = p => p.split(sep).join('/');
export const canonicalCwd = cwd => { try { return realpathSync(cwd); } catch { return resolve(cwd); } };
// Git's line terminator is framing; leading/trailing spaces belong to the path.
const gitPathLine = value => value.replace(process.platform === 'win32' ? /\r?\n$/ : /\n$/, '');

// Git defines the input manifest when available: tracked + ordinary untracked files. Ignored
// untracked outputs are excluded; tracked outputs remain inputs. Outside git use a conservative
// filesystem manifest without guessing which ordinary files are generated. Never follow symlinks.
export function sourceIdentity(cwd, proto = {}) {
  return fingerprintSource(cwd, proto);
}

// Namespace timestamps retain create/remove transitions even when the path is gone
// before an OS notification arrives. Keep these within-run identities separate from
// the source digest: ignored outputs between invocations do not change source bytes.
export function directoryIdentity(path) {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory()) return 'not-directory';
    return digest([stat.dev, stat.ino, stat.mtimeNs, stat.ctimeNs].map(String));
  } catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
}

function namespaceParent(path) {
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    try {
      const actual = canonicalCwd(dir);
      if (lstatSync(actual).isDirectory()) return actual;
      throw new Error('authority parent is not a directory');
    } catch (error) { if (error.code !== 'ENOENT' || dirname(dir) === dir) throw error; }
  }
}

function symlinkIdentity(path) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isSymbolicLink()) throw new Error('input symlink changed type during capture');
  const target = readlinkSync(path);
  return { target, identity: digest({ target, device: String(stat.dev), inode: String(stat.ino),
    mode: String(stat.mode), modified: String(stat.mtimeNs), changed: String(stat.ctimeNs) }) };
}

function sourceDirectories(root, hidden, method) {
  const identities = Object.create(null);
  const walk = dir => {
    identities[dir] = directoryIdentity(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      const abs = join(dir, entry.name), path = slash(relative(root, abs));
      if (path === hidden || path.startsWith(hidden + '/') || path === '.chalk/held-out') continue;
      if (path === '.chalk') {
        // Bookkeeping changes independently of source. Only its visible test tree
        // participates; never enumerate its other children or held-out content.
        if (hidden === '.chalk/tests' || '.chalk/tests'.startsWith(hidden + '/')) continue;
        const tests = join(abs, 'tests'), parentIdentity = directoryIdentity(abs);
        try { if (lstatSync(tests).isDirectory()) walk(tests); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          // An absent visible-contract tree can be created and removed before a
          // watcher starts. Its existing parent's namespace retains that transition.
          identities[abs] = parentIdentity;
        }
        continue;
      }
      if (method === 'git') {
        const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', entry.name], { cwd: dir, encoding: 'utf8' });
        if (ignored.status === 0) continue;
        if (ignored.status !== 1) throw new Error('cannot classify source-directory namespace');
      }
      walk(abs);
    }
  };
  walk(root);
  return identities;
}

function fingerprintSource(cwd, proto, filesystemOnly = false) {
  const root = canonicalCwd(cwd);
  const raw = String(proto.regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir());
  const hidden = slash(relative(root, canonicalCwd(resolve(root, raw))));
  const excluded = p => p === hidden || p.startsWith(hidden + '/') ||
    p.split('/').includes('.git') ||
    (p === '.chalk' || p === '.chalk/tests' ? false : p.startsWith('.chalk/') && !p.startsWith('.chalk/tests/'));
  const files = Object.create(null);
  const policyInputs = Object.create(null);
  const membershipInputs = Object.create(null);
  const namespaceInputs = Object.create(null);
  const sharedMetadata = Object.create(null);
  const identifyMembership = (path, kind) => {
    const parent = namespaceParent(path), hiddenRoot = canonicalCwd(resolve(root, raw));
    if (parent === hiddenRoot || parent.startsWith(hiddenRoot + sep) || slash(parent).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be a membership namespace');
    const parentIdentity = namespaceInputs[parent] || directoryIdentity(parent);
    const identity = membershipIdentity(path, kind);
    if (identity === 'deleted' && !Object.hasOwn(namespaceInputs, parent)) namespaceInputs[parent] = parentIdentity;
    return identity;
  };
  const gitlinks = new Map();
  const links = [];
  let method = 'filesystem';
  try {
    if (!lstatSync(root).isDirectory()) throw new Error('workspace is not a directory');
    const git = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    let paths = [];
    if (!filesystemOnly && git.status === 0 && git.stdout.trim() === 'true') {
      method = 'git';
      Object.assign(namespaceInputs, sourceDirectories(root, hidden, method));
      const pathspec = ['--', '.', ':(exclude,literal).chalk/held-out', ...(hidden && !hidden.startsWith('../') ? [`:(exclude,literal)${hidden}`] : [])];
      const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', ...pathspec], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (listed.status !== 0 || listed.error) throw new Error('cannot enumerate git inputs');
      paths = listed.stdout.split('\0').filter(Boolean);
      // Index writes can temporarily turn ignored files into tracked inputs. Keep this
      // within-run authority identity separate from source identity, so staging unchanged
      // ordinary inputs between runs does not change their source fingerprint.
      for (const args of [['--git-path', 'index'], ['--shared-index-path']]) {
        const index = spawnSync('git', ['rev-parse', ...args], { cwd: root, encoding: 'utf8' });
        if (index.status !== 0) throw new Error('cannot locate Git input membership');
        if (!gitPathLine(index.stdout)) continue;
        const path = resolve(root, gitPathLine(index.stdout)), actual = canonicalCwd(path), hiddenRoot = canonicalCwd(resolve(root, raw));
        if (actual === hiddenRoot || actual.startsWith(hiddenRoot + sep) || slash(actual).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be an index input');
        const kind = args[0] === '--shared-index-path' ? 'shared' : 'index';
        const identify = p => identifyMembership(p, kind);
        try { membershipInputs[path] = { kind, identity: identify(path) }; if (actual !== path) membershipInputs[actual] = { kind, identity: identify(actual) }; }
        catch (e) { if (e.code === 'ENOENT') membershipInputs[path] = { kind, identity: 'deleted' }; else throw e; }
      }
      // Ignore rules are inputs to the manifest and watcher classification, including rules
      // outside the worktree. Bind their bytes/metadata without recording config contents.
      const origins = spawnSync('git', ['config', '--show-origin', '--name-only', '--null', '--list'], { cwd: root, encoding: 'utf8' });
      const info = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: root, encoding: 'utf8' });
      const global = spawnSync('git', ['config', '--null', '--path', '--get', 'core.excludesfile'], { cwd: root, encoding: 'utf8' });
      if (origins.status !== 0 || info.status !== 0 || ![0, 1].includes(global.status)) throw new Error('cannot identify Git ignore policy');
      if (global.status === 0 && !global.stdout.endsWith('\0')) throw new Error('cannot decode Git ignore-policy path');
      const policy = new Set([resolve(root, gitPathLine(info.stdout)), resolve(root, '.gitignore'), global.status === 0 ? resolve(root, global.stdout.slice(0, -1)) : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'git/ignore')]);
      const externalIgnore = global.status === 0 ? resolve(root, global.stdout.slice(0, -1)) : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'git/ignore');
      const explicitAuthorities = new Set([resolve(root, gitPathLine(info.stdout)), externalIgnore]);
      const addAuthority = path => { policy.add(path); explicitAuthorities.add(path); };
      // Origins only report files that supplied entries. Ask Git for configuration
      // authorities as well, so an absent/empty file cannot appear transiently unnoticed.
      for (const name of ['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL']) {
        const candidates = spawnSync('git', ['var', name], { cwd: root, encoding: 'utf8' });
        if (candidates.status !== 0) throw new Error(`cannot locate ${name}; use Git with configuration-path discovery support`);
        const value = gitPathLine(candidates.stdout);
        let paths;
        if (name === 'GIT_CONFIG_SYSTEM' || process.env[name] !== undefined) {
          // The system location and an explicit global override each select ONE
          // file. A newline inside that filename is data, not a list separator.
          paths = [value];
        } else {
          // Default global discovery can return both XDG and home locations. Git's
          // newline-delimited list cannot disambiguate newlines inside those roots.
          if ([homedir(), process.env.HOME, process.env.XDG_CONFIG_HOME].some(path => path?.includes('\n'))) throw new Error('ambiguous default Git configuration paths; use an explicit GIT_CONFIG_GLOBAL path');
          paths = value.split(process.platform === 'win32' ? /\r?\n/ : /\n/);
          if (paths.length > 2) throw new Error('ambiguous default Git configuration path list');
        }
        for (const path of paths.filter(Boolean)) addAuthority(resolve(root, path));
      }
      // HEAD selects includeIf.onbranch configuration even when no config bytes change.
      // commondir selects the shared configuration in a linked worktree.
      for (const name of ['config', 'config.worktree', 'HEAD', 'commondir']) {
        const candidate = spawnSync('git', ['rev-parse', '--git-path', name], { cwd: root, encoding: 'utf8' });
        if (candidate.status !== 0) throw new Error('cannot locate repository configuration');
        addAuthority(resolve(root, gitPathLine(candidate.stdout)));
      }
      const includes = spawnSync('git', ['config', '--path', '--show-origin', '--null', '--get-regexp', '^(include|includeif[.].*)[.]path$'], { cwd: root, encoding: 'utf8' });
      if (![0, 1].includes(includes.status)) throw new Error('cannot locate included configuration');
      const included = includes.stdout.split('\0');
      for (let n = 0; n + 1 < included.length; n += 2) {
        if (!included[n].startsWith('file:')) throw new Error('cannot locate include origin');
        const value = included[n + 1].slice(included[n + 1].indexOf('\n') + 1);
        addAuthority(resolve(dirname(resolve(root, included[n].slice(5))), value));
      }
      const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
      if (top.status !== 0) throw new Error('cannot locate ancestor ignore policies');
      const gitRoot = canonicalCwd(gitPathLine(top.stdout));
      // Repository discovery can change without editing the currently selected index or
      // configuration. Bind every nearer .git candidate (including absent ones), plus
      // explicit Git directory selectors, so switching repositories cannot hide inputs.
      const selectors = new Set();
      for (let dir = root; dir === gitRoot || dir.startsWith(gitRoot + sep); dir = dirname(dir)) {
        policy.add(join(dir, '.gitignore')); selectors.add(join(dir, '.git')); if (dir === gitRoot) break;
      }
      for (const arg of ['--absolute-git-dir', '--git-common-dir']) {
        const selected = spawnSync('git', ['rev-parse', arg], { cwd: root, encoding: 'utf8' });
        if (selected.status !== 0) throw new Error('cannot locate repository selector');
        selectors.add(resolve(root, gitPathLine(selected.stdout)));
      }
      for (const path of selectors) {
        const actual = canonicalCwd(path), hiddenRoot = canonicalCwd(resolve(root, raw));
        if (actual === hiddenRoot || actual.startsWith(hiddenRoot + sep) || slash(actual).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be a repository selector');
        for (const p of new Set([path, actual])) membershipInputs[p] = { kind: 'locator', identity: identifyMembership(p, 'locator') };
      }
      const fields = origins.stdout.split('\0');
      for (let n = 0; n < fields.length; n += 2) if (fields[n].startsWith('file:')) addAuthority(resolve(root, fields[n].slice(5)));
      for (const p of [...paths].sort().filter(p => !excluded(p))) {
        let dir = dirname(resolve(root, p));
        while (dir === root || dir.startsWith(root + sep)) { policy.add(join(dir, '.gitignore')); if (dir === root) break; dir = dirname(dir); }
      }
      for (const path of policy) {
        const actual = canonicalCwd(path), hiddenRoot = canonicalCwd(resolve(root, raw));
        if (actual === hiddenRoot || actual.startsWith(hiddenRoot + sep) || slash(actual).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be an ignore-policy input');
        const parent = namespaceParent(path);
        if (parent === hiddenRoot || parent.startsWith(hiddenRoot + sep) || slash(parent).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be an authority namespace');
        const parentIdentity = directoryIdentity(parent);
        try { policyInputs[path] = fileIdentity(path); if (actual !== path) policyInputs[actual] = fileIdentity(actual); }
        catch (e) {
          if (e.code !== 'ENOENT') throw e;
          policyInputs[path] = 'deleted';
          // A .gitignore below an already ignored ancestor cannot re-include that
          // ancestor's children. Tracked descendants remain inputs regardless of
          // ignores. Its absence must not turn stable generated output into source.
          let excludedAncestor = false;
          if (basename(path) === '.gitignore' && !explicitAuthorities.has(path) &&
              (parent === gitRoot || parent.startsWith(gitRoot + sep)) && parent === canonicalCwd(dirname(path))) {
            const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', '.'], { cwd: parent, encoding: 'utf8' });
            if (![0, 1].includes(ignored.status)) throw new Error('cannot identify absent ignore authority scope');
            excludedAncestor = ignored.status === 0;
          }
          if (!excludedAncestor && !Object.hasOwn(namespaceInputs, parent)) namespaceInputs[parent] = parentIdentity;
        }
      }
      const staged = spawnSync('git', ['ls-files', '--stage', '-z', ...pathspec], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (staged.status !== 0 || staged.error) throw new Error('cannot enumerate gitlink inputs');
      for (const entry of staged.stdout.split('\0')) {
        const match = /^160000 ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(entry);
        if (match && !excluded(match[3])) {
          if (match[2] !== '0') throw new Error('unmerged submodule input');
          gitlinks.set(match[3], match[1]);
        }
      }
    } else {
      if (!filesystemOnly && (git.error || !/not a git repository/i.test(git.stderr || ''))) throw new Error('cannot determine git workspace identity');
      Object.assign(namespaceInputs, sourceDirectories(root, hidden, method));
      const walk = dir => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const abs = join(dir, e.name), p = slash(relative(root, abs));
          if (excluded(p)) continue;
          if (e.isDirectory()) walk(abs);
          else paths.push(p);
        }
      };
      walk(root);
    }
    for (const p of [...new Set(paths)].sort()) {
      if (excluded(p)) continue;
      if (isAbsolute(p) || p.split('/').includes('..')) throw new Error('invalid input path');
      // A tracked descendant can remain in git after its directory is replaced with a symlink.
      const parts = p.split('/');
      for (let n = 1; n < parts.length; n++) {
        try { if (lstatSync(join(root, ...parts.slice(0, n))).isSymbolicLink()) throw new Error('symlinked input directory'); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      const abs = join(root, p);
      // Ignored directories can contain tracked inputs, including a tracked file
      // already deleted at startup. Capture its parent before reading existence;
      // 'deleted' at both endpoints cannot establish that it remained absent.
      const parent = namespaceParent(abs), parentIdentity = namespaceInputs[parent] || directoryIdentity(parent);
      try {
        const stat = lstatSync(abs);
        if (stat.isSymbolicLink()) {
          const { target, identity } = symlinkIdentity(abs);
          files[p] = identity;
          links.push(slash(relative(root, resolve(dirname(abs), target))));
        }
        else if (stat.isFile()) files[p] = fileIdentity(abs, stat);
        else if (stat.isDirectory() && gitlinks.has(p)) {
          const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: abs, encoding: 'utf8' });
          const initialized = top.status === 0 && canonicalCwd(gitPathLine(top.stdout)) === canonicalCwd(abs);
          const head = initialized ? spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: abs, encoding: 'utf8' }) : null;
          if (head && (head.status !== 0 || head.error)) throw new Error(`cannot identify submodule: ${p}`);
          // An uninitialized gitlink is often an empty directory. Do not accidentally enumerate
          // the parent repository from there; fingerprint its local contents conservatively.
          const child = fingerprintSource(abs, { ...proto, regression: { ...proto.regression, dir: resolve(root, raw) } }, !initialized);
          if (child.status !== 'known') throw new Error(`submodule ${p}: ${child.error}`);
          files[p] = digest({ gitlink: gitlinks.get(p), head: head?.stdout.trim() || null, source: child.digest });
          for (const [name, hash] of Object.entries(child.files)) files[`${p}/${name}`] = hash;
          Object.assign(policyInputs, child.policyInputs);
          Object.assign(membershipInputs, child.membershipInputs);
          // Retain the earlier parent traversal's stamp where both scans saw a directory.
          for (const [path, identity] of Object.entries(child.namespaceInputs)) {
            if (!Object.hasOwn(namespaceInputs, path)) namespaceInputs[path] = identity;
          }
        }
        else throw new Error(`unsupported input: ${p}`);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        files[p] = gitlinks.has(p) ? digest({ gitlink: gitlinks.get(p), source: 'deleted' }) : 'deleted';
        if (!Object.hasOwn(namespaceInputs, parent)) namespaceInputs[parent] = parentIdentity;
      }
    }
    if (links.some(p => !Object.hasOwn(files, p))) throw new Error('symlink target is outside the input manifest');
    // Git's initial manifest probes refresh shared-index metadata. Capture its
    // baseline after ALL such probes, but before handing inputs to the observer.
    // Capturing it in the observer would lose restored writes during startup.
    for (const [path, input] of Object.entries(membershipInputs)) {
      if (input.kind === 'shared') sharedMetadata[path] = fileIdentity(path);
    }
    return { status: 'known', method, digest: digest({ files, policyInputs }), files, policyInputs, membershipInputs, namespaceInputs, sharedMetadata };
  } catch (e) { return { status: 'unknown', method, digest: null, files, policyInputs, membershipInputs, namespaceInputs, sharedMetadata, error: e.message }; }
}

// Re-hash the retained manifest while the lifecycle observer protects its membership.
// Avoid re-reading Git's index here: even Git read commands mutate shared-index timestamps.
// New/transient paths and repository-selection changes are independently rejected by the
// continuous observer. This is an endpoint check of the executed manifest, not a new scan.
export function refreshObservedSource(cwd, before) {
  const root = canonicalCwd(cwd), files = Object.create(null), policyInputs = Object.create(null), membershipInputs = Object.create(null), namespaceInputs = Object.create(null), sharedMetadata = Object.create(null);
  try {
    if (before.status !== 'known') throw new Error(before.error || 'unknown initial source');
    for (const [path, identity] of Object.entries(before.files)) {
      const parts = path.split('/');
      for (let n = 1; n < parts.length; n++) {
        try { if (lstatSync(join(root, ...parts.slice(0, n))).isSymbolicLink()) throw new Error('symlinked input directory'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      try {
        const abs = join(root, path), stat = lstatSync(abs);
        if (stat.isSymbolicLink()) files[path] = symlinkIdentity(abs).identity;
        else if (stat.isFile()) files[path] = fileIdentity(abs, stat);
        else if (stat.isDirectory()) files[path] = identity; // Gitlink: child files and HEAD are separately bound.
        else throw new Error('unsupported input');
      } catch (error) { if (error.code === 'ENOENT') files[path] = 'deleted'; else throw error; }
    }
    for (const path of Object.keys(before.policyInputs)) {
      // Do not follow a policy redirected by a command; the observer rejects the change.
      if (canonicalCwd(path) !== path) {
        if (before.policyInputs[canonicalCwd(path)] === undefined) throw new Error('policy path redirected during verification');
      }
      try { policyInputs[path] = fileIdentity(path); }
      catch (error) { if (error.code === 'ENOENT') policyInputs[path] = 'deleted'; else throw error; }
    }
    for (const [path, input] of Object.entries(before.membershipInputs)) {
      if (canonicalCwd(path) !== path && before.membershipInputs[canonicalCwd(path)] === undefined) throw new Error('membership path redirected during verification');
      membershipInputs[path] = { kind: input.kind, identity: membershipIdentity(path, input.kind) };
      if (input.kind === 'shared') sharedMetadata[path] = fileIdentity(path);
    }
    for (const path of Object.keys(before.namespaceInputs || {})) {
      if (canonicalCwd(path) !== path) throw new Error('source-directory namespace redirected during verification');
      namespaceInputs[path] = directoryIdentity(path);
    }
    return { status: 'known', method: before.method, digest: digest({ files, policyInputs }), files, policyInputs, membershipInputs, namespaceInputs, sharedMetadata, manifest: 'observed-initial' };
  } catch (error) { return { status: 'unknown', method: before.method, digest: null, files, policyInputs, membershipInputs, namespaceInputs, sharedMetadata, error: error.message }; }
}

// Metadata preserves evidence of rewrites that restore the original bytes before the command exits.
// A command-time watcher additionally records transient input creation/deletion.
export function fileIdentity(path, stat = lstatSync(path)) {
  return digest({ content: digest(readFileSync(path)), executable: stat.mode & 0o111, modified: stat.mtimeMs, changed: stat.ctimeMs, inode: stat.ino });
}

export function membershipIdentity(path, kind) {
  try {
    const stat = lstatSync(path);
    if (kind === 'shared') return digest({ content: digest(readFileSync(path)), inode: stat.ino });
    if (kind === 'locator' && (stat.isDirectory() || stat.isSymbolicLink())) {
      return digest({ directory: stat.isDirectory(), link: stat.isSymbolicLink() ? readlinkSync(path) : null,
        inode: stat.ino, modified: stat.mtimeMs, changed: stat.ctimeMs });
    }
    return fileIdentity(path, stat);
  } catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
}

// The observer must remain responsive while checking contracts/indexes at completion.
// Read bounded chunks asynchronously; no synchronous file read/hash can hold up events.
async function contentIdentityAsync(path) {
  const file = await fsAsync.open(path, constants.O_RDONLY | (constants.O_NONBLOCK || 0)), hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('input is not a regular file');
    for (let position = 0; position < stat.size;) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    return hash.digest('hex');
  } finally { await file.close(); }
}

export async function fileIdentityAsync(path, stat) {
  stat ||= await fsAsync.lstat(path);
  return digest({ content: await contentIdentityAsync(path), executable: stat.mode & 0o111,
    modified: stat.mtimeMs, changed: stat.ctimeMs, inode: stat.ino });
}

export async function membershipIdentityAsync(path, kind) {
  try {
    const stat = await fsAsync.lstat(path);
    if (kind === 'shared') return digest({ content: await contentIdentityAsync(path), inode: stat.ino });
    if (kind === 'locator' && (stat.isDirectory() || stat.isSymbolicLink())) {
      return digest({ directory: stat.isDirectory(), link: stat.isSymbolicLink() ? await fsAsync.readlink(path) : null,
        inode: stat.ino, modified: stat.mtimeMs, changed: stat.ctimeMs });
    }
    return await fileIdentityAsync(path, stat);
  } catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
}

export async function canonicalCwdAsync(path) {
  try { return await fsAsync.realpath(path); } catch { return resolve(path); }
}

export async function assertStorageAsync(dir, identity) {
  const stat = await fsAsync.lstat(dir);
  if (!stat.isDirectory() || !identity || digest({ path: await fsAsync.realpath(dir), inode: stat.ino, device: stat.dev }) !== digest(identity)) {
    throw new Error('verification storage directory was replaced or redirected');
  }
}

// Bounded-memory checks bind retained bytes to what the supervisor actually captured.
export function streamIdentity(path) {
  if (!lstatSync(path).isFile()) throw new Error('retained stream is not a regular file');
  const fd = openSync(path, 'r');
  try { return snapshotStream(fd); }
  finally { closeSync(fd); }
}

// Read the already-open capture descriptor, including output whose pathname was unlinked.
// An optional new private file preserves those recoverable bytes before descriptor closure.
export function snapshotStream(fd, destination) {
  const before = fstatSync(fd), hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  if (!before.isFile()) throw new Error('capture descriptor is not a regular file');
  const output = destination ? openSync(destination, 'wx', 0o600) : null;
  let bytes = 0;
  try {
    while (bytes < before.size) {
      const n = readSync(fd, buffer, 0, Math.min(buffer.length, before.size - bytes), bytes);
      if (!n) throw new Error('captured stream shortened while reading');
      hash.update(buffer.subarray(0, n));
      if (output !== null) for (let offset = 0; offset < n;) {
        const written = writeSync(output, buffer, offset, n - offset);
        if (!written) throw new Error('recovery stream write made no progress');
        offset += written;
      }
      bytes += n;
    }
    const after = fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('captured stream changed while reading');
    return { bytes, sha256: hash.digest('hex') };
  } finally { if (output !== null) closeSync(output); }
}

export function storageIdentity(dir) {
  const stat = lstatSync(dir);
  if (!stat.isDirectory()) throw new Error('verification storage directory was redirected');
  return { path: realpathSync(dir), inode: stat.ino, device: stat.dev };
}

export function assertStorage(dir, identity) {
  if (!identity || digest(storageIdentity(dir)) !== digest(identity)) throw new Error('verification storage directory was replaced or redirected');
}

function atomicStorage(path, identity, write) {
  assertStorage(dirname(path), identity);
  const temp = `${path}.tmp-${randomUUID()}`;
  try {
    write(temp);
    assertStorage(dirname(path), identity);
    renameSync(temp, path);
  } finally {
    // Do not chase a redirected parent even for cleanup.
    try { assertStorage(dirname(path), identity); rmSync(temp, { force: true }); } catch { /* preserve unknown paths */ }
  }
}

export const atomicWrite = (path, contents, identity) => atomicStorage(path, identity, temp => writeFileSync(temp, contents, { flag: 'wx', mode: 0o600 }));
export const atomicCopy = (source, path, identity) => atomicStorage(path, identity, temp => copyFileSync(source, temp, constants.COPYFILE_EXCL));

export function validateVerificationStreams(commands, storage) {
  for (const command of commands) {
    for (const stream of ['stdout', 'stderr']) {
      const path = command[`${stream}Path`], expected = command.streams?.[stream];
      const matches = (p, authority) => { assertStorage(dirname(p), authority); return expected && digest(streamIdentity(p)) === digest(expected); };
      const primaryStorage = path === command.recovery?.[`${stream}Path`] ? command.recovery.storage : storage;
      try { if (matches(path, primaryStorage)) continue; }
      catch { /* recover below, but any lost or changed archive keeps this run closed */ }
      const error = `${command.gate} ${stream} archive is missing, changed or lacks captured identity`;
      command.retentionError = command.retentionError ? `${command.retentionError}; ${error}` : error;
      const recoveryPath = command.recovery?.[`${stream}Path`];
      try {
        if (!recoveryPath || !matches(recoveryPath, command.recovery.storage)) continue;
        // Replace the archive entry atomically; never follow a replaced destination
        // symlink and overwrite the source file to which a later gate redirected it.
        atomicCopy(recoveryPath, path, primaryStorage);
        if (matches(path, primaryStorage)) command.recoveredStreams = [...(command.recoveredStreams || []), stream];
      } catch { /* recovery references remain available in the failed receipt */ }
    }
  }
}

export const verificationConfiguration = proto => ({ verify: proto.verify || {}, runner: proto.runner || '', e2e: proto.e2e || {}, integrity: proto.integrity || '', regression: { dir: proto.regression?.dir || '.chalk/held-out' } });
export const verificationTaskContract = task => ({ id: task.id, specRevision: task.specRevision || 0, acceptanceCriteria: task.acceptanceCriteria || [], tests: task.tests || [] });

export function verificationInputs(store, cwd, observedSource) {
  const proto = store.protocol();
  if (!observedSource && proto.e2e?.command) {
    // Prepare protocol-owned browser output before binding source/authority parents.
    // Creating .chalk/runs during execution would invalidate an absent .chalk/tests
    // namespace, even though all generated reports live outside the input manifest.
    const output = canonicalCwd(resolve(cwd, proto.e2e.runsDir || '.chalk/runs'));
    const hidden = canonicalCwd(resolve(cwd, String(proto.regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir())));
    const parent = namespaceParent(output);
    if ([output, parent].some(path => path === hidden || path.startsWith(hidden + sep) || slash(path).includes('/.chalk/held-out/'))) throw new Error('held-out path cannot be browser output');
    mkdirSync(output, { recursive: true });
  }
  const config = verificationConfiguration(proto);
  const tasks = store.tasks().filter(t => t.state === 'in-progress' && canonicalCwd(workdir(store, t)) === canonicalCwd(cwd))
    .map(verificationTaskContract).sort((a, b) => a.id.localeCompare(b.id));
  const integrityInputs = store.tasks().filter(t => t.state === 'in-progress' || (proto.integrity === 'all-locks' && t.state === 'done')).map(t => {
    const root = canonicalCwd(t.state === 'done' ? cwd : workdir(store, t));
    const tests = (t.tests || []).map(lock => {
      const path = resolve(root, lock.path);
      const hidden = canonicalCwd(resolve(root, String(proto.regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir())));
      const actualPath = canonicalCwd(path);
      if (actualPath === hidden || actualPath.startsWith(hidden + sep) || slash(actualPath).includes('/.chalk/held-out/')) throw new Error('held-out path cannot be a visible integrity input');
      try {
        if (!lstatSync(path).isFile()) throw new Error('integrity input is not a regular file');
        return { ...lock, actual: fileIdentity(path) };
      } catch (e) { if (e.code === 'ENOENT') return { ...lock, actual: 'deleted' }; throw e; }
    });
    return { id: t.id, title: t.title, state: t.state, cwd: root, acceptanceCriteria: t.acceptanceCriteria || [], tests };
  }).sort((a, b) => a.id.localeCompare(b.id));
  // Even a write that restores the original JSON can change the contract between check stages.
  // Bind execution to the captured contracts and retain metadata proving authority-file writes.
  // This is a within-run change detector; later approval reuse must compare semantic contracts,
  // since recording the review itself legitimately changes tasks.json after verification.
  const authorityFiles = Object.fromEntries([store.p.tasks, store.p.chalk].map(path => [path, fileIdentity(path)]));
  return { source: observedSource ? refreshObservedSource(cwd, observedSource) : sourceIdentity(cwd, proto), config, configDigest: digest(config), tasks, tasksDigest: digest(tasks), integrityInputs, integrityDigest: digest(integrityInputs), authorityDigest: digest(authorityFiles), authorityFiles };
}

export function inputsFresh(before, after) {
  if (before?.source?.status !== 'known' || after?.source?.status !== 'known') return 'unknown';
  return before.source.digest === after.source.digest && digest(before.source.membershipInputs || {}) === digest(after.source.membershipInputs || {}) && digest(before.source.namespaceInputs || {}) === digest(after.source.namespaceInputs || {}) && digest(before.source.sharedMetadata || {}) === digest(after.source.sharedMetadata || {}) && before.configDigest === after.configDigest && before.tasksDigest === after.tasksDigest && before.integrityDigest === after.integrityDigest && before.authorityDigest === after.authorityDigest ? 'fresh' : 'stale';
}

export function createVerificationRecord(store, cwd, mode) {
  const id = randomUUID();
  const dir = join(store.root, '.chalk/local/verification', id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const evidence = { id, dir, path: join(dir, 'run.json'), storage: storageIdentity(dir) };
  const record = { version: 1, id, cwd: canonicalCwd(cwd), mode, startedAt: new Date().toISOString(), status: 'running', runtime: { node: process.version, platform: process.platform }, toolchain: [] };
  saveVerificationRecord(evidence, record);
  try { record.before = verificationInputs(store, cwd); }
  catch (e) { Object.assign(record, { status: 'error', green: false, error: e.message, finishedAt: new Date().toISOString() }); }
  saveVerificationRecord(evidence, record);
  return { evidence, record };
}

export function saveVerificationRecord(evidence, record) {
  atomicWrite(evidence.path, JSON.stringify(record, null, 2) + '\n', evidence.storage || storageIdentity(dirname(evidence.path)));
}
