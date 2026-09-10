import { git, gh } from './git.mjs';
import { launchCommand } from './process.mjs';
import { workdir } from './store.mjs';
import { relative, resolve, sep, dirname } from 'node:path';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { canonicalCwd, verificationIntegrityInputs } from './verification-record.mjs';

const oid = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const implementation = path => !path.startsWith('.chalk/') || path.startsWith('.chalk/tests/') || path.startsWith('.chalk/evidence/');
const quote = text => `'${String(text).replace(/'/g, `'"'"'`)}'`;
// Compare raw filesystem inputs with commit objects, independently of Git's
// stat cache, clean filters and core.fileMode. Never follow source symlinks.
function committedInputs(cwd, head, relevant) {
  const command = args => {
    const result = launchCommand('git', args, { cwd, encoding: 'utf8', timeout: 15000 });
    if (result.error || result.status !== 0) throw new Error('cannot inspect committed inputs — resolve Git inputs and retry chalk merge');
    return String(result.stdout);
  };
  const entries = command(['ls-tree', '-r', '-z', head, '--', '.']).split('\0').filter(Boolean);
  const tree = new Map();
  for (const entry of entries) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error('unsupported commit tree — resolve Git inputs and retry chalk merge');
    const [, mode, type, hash, path] = match, abs = resolve(cwd, path);
    if (!relevant(abs)) continue;
    tree.set(path, `${mode} ${hash}`);
    try {
      for (let parent = dirname(abs); parent !== cwd; parent = dirname(parent)) {
        if (parent === dirname(parent) || !lstatSync(parent).isDirectory()) throw new Error('source parent is not a directory');
      }
      const stat = lstatSync(abs);
      if (type === 'commit') {
        if (!stat.isDirectory() || canonicalCwd(git(abs, 'rev-parse --show-toplevel')) !== abs || git(abs, 'rev-parse HEAD') !== hash) throw new Error('submodule candidate differs');
        committedInputs(abs, hash, relevant);
        continue;
      }
      const actualMode = stat.isSymbolicLink() ? '120000' : stat.isFile() ? (stat.mode & 0o111 ? '100755' : '100644') : '';
      if (actualMode !== mode) throw new Error('candidate mode differs');
      const bytes = stat.isSymbolicLink() ? readlinkSync(abs, { encoding: 'buffer' }) : readFileSync(abs);
      const actualHash = createHash(hash.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (actualHash !== hash) throw new Error('candidate bytes differ');
    } catch (error) {
      throw new Error(`working input differs from committed candidate (${path}) — resolve Git filters/mode or working changes, then run chalk commit and chalk pr before merge: ${error.message}`);
    }
  }
  // Inspect index metadata, never ask diff/filters to read protected content.
  // Recurse above so parent submodule-ignore settings cannot hide child inputs.
  const indexed = new Map();
  for (const entry of command(['ls-files', '--stage', '-z', '--']).split('\0').filter(Boolean)) {
    const match = /^(\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error('unsupported index entry — resolve Git inputs and retry chalk merge');
    const [, mode, hash, stage, path] = match;
    if (!relevant(resolve(cwd, path))) continue;
    if (stage !== '0' || tree.get(path) !== `${mode} ${hash}`) throw new Error('uncommitted implementation inputs — run chalk commit, then chalk pr before merge');
    indexed.set(path, true);
  }
  if ([...tree.keys()].some(path => !indexed.has(path)) ||
      command(['ls-files', '--others', '--exclude-standard', '-z', '--']).split('\0').filter(Boolean).some(path => relevant(resolve(cwd, path)))) {
    throw new Error('uncommitted implementation inputs — run chalk commit, then chalk pr before merge');
  }
}

export function localMergeHead(store, task) {
  const cwd = canonicalCwd(workdir(store, task)), head = git(cwd, 'rev-parse HEAD');
  if (!oid(head)) throw new Error('local candidate is unavailable — run chalk commit, then chalk pr');
  const locks = new Set(verificationIntegrityInputs(store, cwd).flatMap(input => input.tests.map(test => relative(cwd, resolve(input.cwd, test.path)).split(sep).join('/'))).filter(path => path && path !== '..' && !path.startsWith('../')));
  const hidden = canonicalCwd(resolve(cwd, String(store.protocol().regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir())));
  const relevant = abs => {
    const path = relative(cwd, abs).split(sep).join('/');
    if (abs === hidden || abs.startsWith(hidden + sep) || ('/' + path + '/').includes('/.chalk/held-out/')) return false;
    return implementation(path) || locks.has(path);
  };
  for (const path of locks) {
    const tracked = launchCommand('git', ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', path], { cwd, encoding: 'utf8', timeout: 15000 });
    if (tracked.error || tracked.status !== 0) throw new Error('checked visible tests are not tracked — add them to Git, then run chalk commit and chalk pr');
  }
  // Git's ordinary diff may trust these flags without reading working bytes.
  // They cannot establish publication of the source verification actually read.
  for (const flag of ['-v', '-f']) {
    const listed = launchCommand('git', ['ls-files', flag, '-z', '--'], { cwd, encoding: 'utf8', timeout: 15000 });
    if (listed.error || listed.status !== 0) throw new Error('cannot inspect candidate index flags — resolve Git inputs and retry chalk merge');
    const flagged = String(listed.stdout).split('\0').filter(entry => /^[a-zS] /.test(entry) && relevant(resolve(cwd, entry.slice(2)))).map(entry => entry.slice(2));
    if (flagged.length) {
      const paths = flagged.map(quote).join(' ');
      const recovery = ['--no-assume-unchanged', '--no-skip-worktree', '--no-fsmonitor-valid'].map(flag => `git update-index ${flag} -- ${paths}`).join('; ');
      throw new Error(`index flags can hide candidate changes — run ${recovery}; then chalk verify, chalk review ${task.id} and chalk merge ${task.id}`);
    }
  }
  committedInputs(cwd, head, relevant);
  return head;
}

export function remotePrCandidate(store, task) {
  let record;
  try { record = JSON.parse(gh(workdir(store, task), store.protocol().github?.command, `pr view ${task.pr.number} --json headRefOid,state`)); }
  catch { throw new Error('PR head cannot be established — check the provider and retry chalk pr, then chalk merge'); }
  if (!oid(record?.headRefOid) || !['OPEN', 'MERGED', 'CLOSED'].includes(record?.state)) throw new Error('PR head/state is unavailable — update the provider and retry chalk merge');
  return { head: record.headRefOid, state: record.state };
}

export function mergeCandidate(store, task) {
  const head = localMergeHead(store, task), remote = remotePrCandidate(store, task);
  if (remote.head !== head) throw new Error('PR head does not contain the verified local candidate — publish it with chalk pr before merge');
  if (remote.state === 'CLOSED') throw new Error('PR is closed without merging — resolve the PR before chalk merge');
  return { head, pr: task.pr.number };
}
