// A synchronous API backed by an asynchronous supervisor. The supervisor owns the command,
// watches its inputs, and can archive an interrupted run even if the calling CLI is killed.
import { spawn, spawnSync } from 'node:child_process';
import fsAsync from 'node:fs/promises';
import { Worker, MessageChannel, receiveMessageOnPort, workerData } from 'node:worker_threads';
import { readFileSync, writeSync, openSync, closeSync, rmSync, mkdirSync, mkdtempSync, watch, lstatSync, statSync, readdirSync, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sourceIdentity, saveVerificationRecord, canonicalCwd, membershipIdentity, snapshotStream, storageIdentity, assertStorage, atomicCopy, atomicWrite, digest, fileIdentityAsync, membershipIdentityAsync, canonicalCwdAsync, assertStorageAsync, directoryIdentity } from './verification-record.mjs';

const SELF = fileURLToPath(import.meta.url);

const metadataOf = stat => digest(stat.isDirectory() ? { directory: true, inode: stat.ino, device: stat.dev } : {
  inode: stat.ino, device: stat.dev, size: stat.size, mode: stat.mode, modified: stat.mtimeMs, changed: stat.ctimeMs,
});
// Gitlink directory timestamps can change for legitimately ignored generated output.
const metadataStamp = path => {
  try { return metadataOf(lstatSync(path)); }
  catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
};
const metadataStampAsync = async path => {
  try { return metadataOf(await fsAsync.lstat(path)); }
  catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
};

export function runVerificationCommand(request) {
  const r = spawnSync(process.execPath, [SELF, '--supervise'], {
    input: JSON.stringify({ ...request, parentPid: process.pid }), encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // The supervisor enforces the command deadline and owns cancellation/archival.
  });
  if (r.error || r.status !== 0) throw new Error(`verification supervisor failed: ${r.error?.message || r.stderr || r.signal || r.status}`);
  return JSON.parse(r.stdout);
}

// Bounded asynchronous Git probes keep ignore classification from blocking filesystem
// notifications. Each monitor owns a small queue rather than spawning an unbounded burst.
function gitClassifier() {
  const queue = []; let active = 0;
  const pump = () => { while (active < 4 && queue.length) queue.shift()(); };
  return (args, cwd, input = '') => new Promise(resolveResult => {
    queue.push(() => {
      active++; let child, timer, settled = false, failure = null, bytes = 0;
      const chunks = [];
      const finish = status => {
        if (settled) return;
        settled = true; clearTimeout(timer); active--;
        resolveResult({ status: failure ? null : status, stdout: Buffer.concat(chunks).toString('utf8') }); pump();
      };
      try {
        child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
        timer = setTimeout(() => { failure = 'Git classification timed out'; child.kill('SIGKILL'); finish(null); }, 10000);
        child.once('error', error => { failure = error.message; finish(null); });
        child.stdout.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) { failure = 'Git classification output exceeded limit'; child.kill('SIGKILL'); finish(null); }
          else chunks.push(chunk);
        });
        child.stdout.on('error', error => { failure = error.message; child.kill('SIGKILL'); finish(null); });
        child.stdin.on('error', error => { failure = error.message; });
        child.once('close', finish); child.stdin.end(input);
      } catch (error) { failure = error.message; finish(null); }
    });
    pump();
  });
}

function monitorInputs(root, proto, changed, failed, source) {
  const initial = source ? structuredClone(source) : sourceIdentity(root, proto);
  if (initial.status !== 'known') throw new Error(initial.error);
  const contractInputs = initial.contractInputs || {};
  Object.assign(initial.policyInputs, contractInputs);
  const label = path => Object.hasOwn(contractInputs, path) ? 'contract' : Object.hasOwn(initial.membershipInputs || {}, path) ? 'git-membership' : 'git-policy';
  const hidden = canonicalCwd(resolve(root, String(proto.regression?.dir || '.chalk/held-out').replace(/^~(?=$|[/\\])/, homedir())));
  const excluded = path => {
    const abs = resolve(root, path);
    return abs === hidden || abs.startsWith(hidden + sep) || path.split('/').includes('.git') ||
      (path === '.chalk' || path.startsWith('.chalk/') && path !== '.chalk/tests' && !path.startsWith('.chalk/tests/'));
  };
  const dirs = new Set([root]), known = new Set(Object.keys(initial.files));
  for (const path of known) {
    let dir = dirname(resolve(root, path));
    while (dir !== root && dir.startsWith(root + sep)) { dirs.add(dir); dir = dirname(dir); }
    // Gitlinks are themselves directories and may currently be empty.
    try { if (lstatSync(resolve(root, path)).isDirectory()) dirs.add(resolve(root, path)); } catch { /* deleted input */ }
  }
  // Empty directories have no manifest files but can receive transient inputs during a command.
  // Enumerate eligible directories without descending into ignored or hidden trees.
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const abs = join(dir, entry.name), path = relative(root, abs).split(sep).join('/');
      if (excluded(path) && path !== '.chalk') continue;
      if (initial.method === 'git' && !dirs.has(abs) && path !== '.chalk') {
        const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', entry.name], { cwd: dir, encoding: 'utf8' });
        if (ignored.status === 0) continue;
        if (ignored.status !== 1) throw new Error('cannot classify input directory');
      }
      dirs.add(abs); walk(abs);
    }
  };
  walk(root);
  // Classification below discovers Git from each event directory, not just the root.
  // Bind its selector even when absent; otherwise a temporary nested repository can
  // change ignore rules while its .git event is excluded from ordinary source watching.
  for (const dir of dirs) {
    const path = join(dir, '.git');
    if (!Object.hasOwn(initial.membershipInputs, path)) initial.membershipInputs[path] = { kind: 'locator', identity: membershipIdentity(path, 'locator') };
  }
  // The initial snapshot captures shared-index metadata after its Git probes. Preserve
  // that baseline across startup; replacing it here would lose restored earlier writes.
  const sharedStamps = Object.fromEntries(Object.entries(initial.membershipInputs || {})
    .filter(([, input]) => input.kind === 'shared').map(([path]) => {
      if (!initial.sharedMetadata?.[path]) throw new Error('missing initial shared-index metadata');
      return [path, initial.sharedMetadata[path]];
    }));
  const sourceStamps = Object.fromEntries([...known].map(path => [path, metadataStamp(resolve(root, path))]));
  const watchers = [], pending = new Set(), git = gitClassifier();
  const observe = action => {
    const work = Promise.resolve().then(action).catch(error => failed(error.message));
    pending.add(work); work.finally(() => pending.delete(work));
  };
  try {
    // Explicit watches bypass .git/source exclusions. Watch the nearest existing parent
    // when a policy file does not exist yet, so create-use-delete changes are retained.
    const policies = new Map();
    for (const path of [...Object.keys(initial.policyInputs || {}), ...Object.keys(initial.membershipInputs || {})]) {
      let parent = dirname(path);
      while (true) {
        try { if (statSync(parent).isDirectory()) break; throw new Error('invalid policy parent'); }
        catch (e) { if (e.code !== 'ENOENT' || dirname(parent) === parent) throw e; parent = dirname(parent); }
      }
      if (!policies.has(parent)) policies.set(parent, []);
      policies.get(parent).push(path);
    }
    for (const [parent, paths] of policies) {
      const w = watch(parent, (_event, filename) => observe(async () => {
        if (!filename) { failed('ignore-policy watcher did not identify the changed path'); return; }
        const path = join(parent, String(filename));
        if (paths.some(p => p === path || p.startsWith(path + sep))) {
          const membership = initial.membershipInputs?.[path];
          if (membership) {
            const actual = await canonicalCwdAsync(path);
            if (actual === hidden || actual.startsWith(hidden + sep) || actual.split(sep).join('/').includes('/.chalk/held-out/')) { failed('membership path moved into excluded content'); return; }
          }
          if (membership?.kind === 'locator') {
            try { if (await membershipIdentityAsync(path, 'locator') === membership.identity) return; }
            catch (error) { failed(error.message); }
          }
          if (Object.hasOwn(sharedStamps, path)) {
            try { if (await fileIdentityAsync(path) === sharedStamps[path]) return; }
            catch (error) { if (error.code !== 'ENOENT') failed(error.message); }
          }
          changed(`${label(path)}:${path}`);
        }
      }));
      w.on('error', error => failed(error.message)); watchers.push(w);
    }
    for (const dir of dirs) {
      try {
        const w = watch(dir, (_event, filename) => observe(async () => {
          if (!filename) { failed('input watcher did not identify the changed path'); return; }
          const abs = join(dir, String(filename)), path = relative(root, abs).split(sep).join('/');
          if (basename(abs) === '.git') { changed(`git-membership:${abs}`); return; }
          if (excluded(path)) return;
          if (basename(abs) === '.gitignore') { changed(path); return; }
          if (!known.has(path) && initial.method === 'git') {
            // Resolve ignores in the closest existing directory, including a submodule's own repo.
            const ignored = await git(['check-ignore', '--no-index', '--', basename(abs)], dir);
            if (ignored.status === 0) {
              // check-ignore consults the current file type. A queued file event can now
              // point at a replacement directory, so a directory-only match proves nothing
              // about that event. Only type-independent ignore rules can exclude it.
              const rule = await git(['check-ignore', '--no-index', '-v', '-z', '--stdin'], dir, basename(abs) + '\0');
              const pattern = rule.stdout?.split('\0')[2];
              if (rule.status !== 0 || !pattern || pattern.startsWith('!')) failed('cannot establish changed input ignore rule');
              else if (pattern.endsWith('/')) {
                // Every event below an ignored ancestor necessarily had a directory at
                // that ancestor. Ambiguity concerns the changed leaf itself, not its
                // parent (e.g. build/output.log beside force-tracked build/.gitkeep).
                const ancestor = await git(['check-ignore', '--no-index', '--', '.'], dir);
                if (ancestor.status === 1) failed(`directory-only ignore cannot establish the original type of changed path: ${path}; explicitly declare type-independent generated output`);
                else if (ancestor.status !== 0) failed('cannot establish changed input ancestor ignore rule');
              }
              return;
            }
            if (ignored.status !== 1) { failed('cannot classify changed input'); return; }
            // Never guess the type of a vanished path. A directory-only ignore cannot prove
            // that a transient ordinary file with the same name was generated output.
            try { await fsAsync.lstat(abs); }
            catch (e) {
              if (e.code === 'ENOENT') {
                const directory = await git(['check-ignore', '--no-index', '--', basename(abs) + '/'], dir);
                if (directory.status === 0) { failed(`changed path vanished before its type could be established: ${path}; keep generated directories present during verification or explicitly ignore both file and directory forms`); return; }
                if (directory.status !== 1) { failed('cannot classify removed input directory'); return; }
              } else { failed(e.message); return; }
            }
          }
          changed(path);
        }));
        w.on('error', error => failed(error.message)); watchers.push(w);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  } catch (e) { for (const w of watchers) w.close(); throw e; }
  // Once every watcher is installed, reconcile membership without reading Git's index.
  // A file can appear after the recorded manifest but before observer startup. Existing
  // new files must be rejected even though their creation notification predates watching.
  // Index/policy endpoint identities protect the classification used for this reconciliation.
  try {
    for (const dir of dirs) {
      if (!lstatSync(dir).isDirectory()) { failed('input directory changed during observer startup'); continue; }
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name), path = relative(root, abs).split(sep).join('/');
        if (excluded(path) || known.has(path) || entry.isDirectory() && dirs.has(abs)) continue;
        if (initial.method === 'git') {
          const ignored = spawnSync('git', ['check-ignore', '--no-index', '--', entry.name], { cwd: dir, encoding: 'utf8' });
          if (ignored.status === 0) continue;
          if (ignored.status !== 1) { failed('cannot reconcile input membership'); continue; }
        }
        changed(path);
      }
    }
  } catch (error) { failed(error.message); }
  const check = async () => {
    // Persistent/restored input writes need not wait for platform notification delivery.
    // Metadata checks keep the completion boundary cheap while supplementing transient-event
    // coverage. The controller separately re-hashes the observed manifest's content.
    for (const [path, stamp] of Object.entries(sourceStamps)) {
      const abs = resolve(root, path), actual = await canonicalCwdAsync(abs);
      if (actual === hidden || actual.startsWith(hidden + sep) || actual.split(sep).join('/').includes('/.chalk/held-out/')) { failed('input path moved into excluded content'); continue; }
      try { if (await metadataStampAsync(abs) !== stamp) changed(path); }
      catch (error) { failed(error.message); }
    }
    // Filesystem notifications can arrive after a short command's drain window. Record
    // endpoint membership changes as well; the watcher still covers restored transitions.
    for (const [path, identity] of Object.entries(initial.policyInputs || {})) {
      const actual = await canonicalCwdAsync(path);
      if (actual === hidden || actual.startsWith(hidden + sep) || actual.split(sep).join('/').includes('/.chalk/held-out/')) { failed('policy path moved into excluded content'); continue; }
      let current;
      try { current = await fileIdentityAsync(path); }
      catch (error) { if (error.code === 'ENOENT') current = 'deleted'; else { failed(error.message); continue; } }
      if (current !== identity) changed(`${label(path)}:${path}`);
    }
    for (const [path, input] of Object.entries(initial.membershipInputs || {})) {
      const actual = await canonicalCwdAsync(path);
      if (actual === hidden || actual.startsWith(hidden + sep) || actual.split(sep).join('/').includes('/.chalk/held-out/')) { failed('membership path moved into excluded content'); continue; }
      let current;
      try { current = input.kind === 'shared' ? await fileIdentityAsync(path) : await membershipIdentityAsync(path, input.kind); }
      catch (error) { if (error.code === 'ENOENT') current = 'deleted'; else { failed(error.message); continue; } }
      if (current !== (sharedStamps[path] || input.identity)) changed(`git-membership:${path}`);
    }
  };
  const checkNamespaces = () => {
    for (const [path, identity] of Object.entries(initial.namespaceInputs || {})) {
      if (canonicalCwd(path) !== path) { failed('source-directory namespace redirected during verification'); continue; }
      try { if (directoryIdentity(path) !== identity) changed(`source-directory:${path}`); }
      catch (error) { failed(error.message); }
    }
  };
  const close = () => { for (const watcher of watchers) watcher.close(); };
  const stop = async () => { try {
    await check(); await new Promise(r => setTimeout(r, 30));
    while (pending.size) await Promise.all(pending);
    checkNamespaces();
  } finally { close(); } };
  stop.check = check; stop.checkNamespaces = checkNamespaces; stop.close = close; stop.pending = pending;
  return stop;
}

// A separate thread keeps receiving filesystem events while the synchronous controller
// runs commands, checks integrity, validates archives and collects final input identities.
// Communication stays in memory; a command cannot forge a ready/result file on disk.
export function startVerificationMonitor(cwd, proto, source) {
  if (source?.manifest === 'endpoint-only') throw new Error('approval endpoint identity cannot establish execution observation');
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  // A tiny string-input bootstrap works for callers using --input-type while letting
  // Node inherit/filter its own runtime flags. Explicitly replaying process.execArgv
  // would also replay process-only flags that are invalid for Worker options.
  const bootstrap = `import(${JSON.stringify(import.meta.url)}).catch(async error => {
    const { workerData } = await import('node:worker_threads');
    workerData.port.postMessage({ error: error.message });
    Atomics.store(workerData.signal, 0, 1); Atomics.notify(workerData.signal, 0);
    workerData.port.close();
  });`;
  const worker = new Worker(bootstrap, { eval: true, workerData: { mode: 'monitor', cwd, proto, source, signal, port: port2 }, transferList: [port2] });
  worker.on('error', () => {}); // The bounded synchronous handshake fails closed on worker loss.
  const receive = () => {
    const until = Date.now() + 30000;
    while (Atomics.load(signal, 0) === 0) {
      if (Date.now() >= until) throw new Error('verification input monitor did not respond');
      Atomics.wait(signal, 0, 0, 100);
    }
    const message = receiveMessageOnPort(port1)?.message;
    Atomics.store(signal, 0, 0);
    if (!message || message.error) throw new Error(message?.error || 'verification input monitor lost its response');
    return message;
  };
  const close = () => { port1.close(); worker.terminate(); };
  try { receive(); } catch (error) { close(); throw error; }
  return {
    protect(streams) { port1.postMessage({ type: 'protect', streams }); return receive(); },
    finish() { try { port1.postMessage({ type: 'stop' }); return receive(); } finally { close(); } },
    close,
  };
}

if (workerData?.mode === 'monitor') {
  const { cwd, proto, source, signal, port } = workerData;
  const changes = new Set(), evidenceChanges = new Set(), archives = new Map(), archiveWatchers = new Map(), pending = new Set();
  let monitorError = null;
  const send = value => { port.postMessage(value); Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); };
  // Content is checked against captured hashes by the controller. Metadata + notifications
  // protect already-validated streams while other streams and inputs are being checked.
  // Endpoint metadata avoids a second long, blocking hash sweep in the observer thread.
  const archiveStamp = async ({ path, storage }) => {
    await assertStorageAsync(dirname(path), storage);
    const stat = await fsAsync.lstat(path);
    if (!stat.isFile()) throw new Error('archive is not a regular file');
    return digest({ inode: stat.ino, device: stat.dev, size: stat.size, modified: stat.mtimeMs, changed: stat.ctimeMs });
  };
  try {
    const stop = monitorInputs(canonicalCwd(cwd), proto, path => changes.add(path), error => { monitorError = error; }, source);
    port.on('message', async message => {
      if (message.type === 'protect') {
        for (const stream of message.streams) {
          const parent = dirname(stream.path);
          try {
            await assertStorageAsync(parent, stream.storage);
            if (!archiveWatchers.has(parent)) {
              const watcher = watch(parent, (_event, filename) => {
                if (!filename) { for (const path of archives.keys()) if (dirname(path) === parent) evidenceChanges.add(path); return; }
                const path = join(parent, String(filename));
                if (archives.has(path)) {
                  // Some hosts deliver a queued archival event after watch registration.
                  // Ignore it only when the complete metadata baseline is still unchanged.
                  const check = (async () => {
                    try { if (await archiveStamp(archives.get(path)) === archives.get(path).stamp) return; } catch { /* changed or unavailable */ }
                    evidenceChanges.add(path);
                  })();
                  pending.add(check); check.finally(() => pending.delete(check));
                }
              });
              watcher.on('error', () => { for (const path of archives.keys()) if (dirname(path) === parent) evidenceChanges.add(path); });
              archiveWatchers.set(parent, watcher);
            }
            archives.set(stream.path, { ...stream, stamp: await archiveStamp(stream) });
          } catch { evidenceChanges.add(stream.path); }
        }
        send({ protected: true });
        return;
      }
      if (message.type !== 'stop') { send({ error: 'invalid verification monitor request' }); return; }
      try {
        await stop.check();
        for (const [path, stream] of archives) {
          try { if (await archiveStamp(stream) !== stream.stamp) evidenceChanges.add(path); }
          catch { evidenceChanges.add(path); }
        }
        // Let pending notifications settle after validation, then independently
        // validate endpoint identities rather than trusting the drain as a barrier.
        await new Promise(r => setTimeout(r, 250));
        while (pending.size || stop.pending.size) await Promise.all([...pending, ...stop.pending]);
        // The receipt certifies a historical boundary, not an atomic snapshot of a
        // writable host. Read endpoint identities AFTER this timestamp so changes
        // through the boundary are included even if notifications are still missing.
        // Writes during endpoint validation may conservatively reject the run too.
        const finishedAt = new Date().toISOString();
        await stop.check();
        stop.checkNamespaces();
        for (const [path, stream] of archives) {
          try { if (await archiveStamp(stream) !== stream.stamp) evidenceChanges.add(path); }
          catch { evidenceChanges.add(path); }
        }
        while (pending.size || stop.pending.size) await Promise.all([...pending, ...stop.pending]);
        stop.close();
        for (const watcher of archiveWatchers.values()) watcher.close();
        send({ inputChanges: [...changes].sort(), monitorError, finishedAt,
          ...(evidenceChanges.size ? { evidenceChanges: [...evidenceChanges].sort() } : {}) });
      } catch (error) { stop.close(); for (const watcher of archiveWatchers.values()) watcher.close(); send({ error: error.message }); }
      port.close();
    });
    send({ ready: true });
  } catch (error) { send({ error: error.message }); port.close(); }
}

async function supervise(q) {
  const root = canonicalCwd(q.cwd), changes = new Set();
  let monitorError = null, captureError = null, cancelled = false, timedOut = false, child, finished = false;
  let spool = mkdtempSync(join(tmpdir(), 'chalk-verify-output-')), spoolStorage = storageIdentity(spool);
  let liveOut = join(spool, 'stdout.log'), liveErr = join(spool, 'stderr.log');
  const fds = [openSync(liveOut, 'w+', 0o600), openSync(liveErr, 'w+', 0o600)];
  const captured = fds.map(() => ({ bytes: 0, hash: createHash('sha256') }));
  let streams;
  const startedAt = new Date().toISOString();
  mkdirSync(dirname(q.stdoutPath), { recursive: true, mode: 0o700 });
  q.storage ||= storageIdentity(dirname(q.stdoutPath));
  const running = { gate: q.gate, status: 'running', cmd: q.cmd, timeoutMs: q.timeoutMs ?? 600000, startedAt, stdoutPath: liveOut, stderrPath: liveErr };
  // Publish recoverable live log references before starting the command.
  const updateReceipt = (gate, interrupted = false) => {
    if (!q.receiptPath) return;
    assertStorage(dirname(q.receiptPath), q.storage);
    const record = JSON.parse(readFileSync(q.receiptPath, 'utf8'));
    const list = record[q.section || 'toolchain'] || [];
    const index = list.findIndex(item => item.gate === q.gate);
    if (index < 0) list.push(gate); else list[index] = { ...list[index], ...gate };
    record[q.section || 'toolchain'] = list;
    if (interrupted) Object.assign(record, { status: 'interrupted', green: false, freshness: 'unknown', finishedAt: new Date().toISOString(), error: 'verification controller exited before completion' });
    saveVerificationRecord({ path: q.receiptPath, storage: q.storage }, record);
  };
  let stopMonitor = () => {};
  try { updateReceipt(running); stopMonitor = monitorInputs(root, q.proto || {}, path => changes.add(path), error => { monitorError = error; }, q.monitorSource); }
  catch (e) { monitorError = e.message; }
  const killTree = () => {
    if (!child?.pid || finished) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } }
  };
  const cancel = () => { cancelled = true; killTree(); boundCancellation(); };
  const failCapture = error => { captureError ||= { code: error.code || 'EIO', message: error.message }; killTree(); boundCancellation(); };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  const parentCheck = setInterval(() => {
    try { process.kill(q.parentPid, 0); } catch (e) { if (e.code === 'ESRCH') cancel(); }
    if (process.platform !== 'win32' && process.ppid !== q.parentPid) cancel();
  }, 100);
  let deadline, cancellationDeadline, cancellationStarted, finishCommand, outputComplete = true;
  const boundCancellation = () => {
    if (cancellationDeadline) return;
    cancellationStarted = Date.now();
    cancellationDeadline = setTimeout(() => {
      outputComplete = false;
      child?.stdout?.destroy(); child?.stderr?.destroy();
      finishCommand?.({ exitCode: child?.exitCode ?? null, signal: child?.signalCode ?? null, errorCode: null });
    }, 1000);
  };
  let outcome;
  try {
    outcome = await new Promise(resolveResult => {
      finishCommand = resolveResult;
      // Pipes remain open while ordinary descendants inherit them, even after the shell exits.
      // Stream chunks to disk immediately; neither capture size nor shell lifetime truncates logs.
      child = spawn(q.cmd, { cwd: root, shell: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      const append = (index, chunk) => { if (captureError) return;
        captured[index].bytes += chunk.length; captured[index].hash.update(chunk);
        const fd = fds[index]; try { for (let offset = 0; offset < chunk.length;) {
        const written = writeSync(fd, chunk, offset, chunk.length - offset);
        if (!written) throw new Error('verification log write made no progress');
        offset += written;
      } } catch (error) { failCapture(error); } };
      child.stdout.on('data', chunk => append(0, chunk));
      child.stderr.on('data', chunk => append(1, chunk));
      child.stdout.on('error', failCapture); child.stderr.on('error', failCapture);
      deadline = setTimeout(() => { timedOut = true; killTree(); boundCancellation(); }, q.timeoutMs ?? 600000);
      child.once('error', e => resolveResult({ exitCode: null, signal: null, errorCode: e.code || 'ESPAWN' }));
      child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal, errorCode: null }));
      if (cancelled) killTree();
    });
    // POSIX descendants can close their streams and still keep running. Keep the process group
    // supervised until it disappears; the same command deadline and cancellation still apply.
    if (process.platform !== 'win32' && child.pid) {
      const groupAlive = () => { try { process.kill(-child.pid, 0); return true; } catch (e) { if (e.code !== 'ESRCH') throw e; return false; } };
      while (groupAlive()) {
        if (cancellationStarted !== undefined && Date.now() - cancellationStarted >= 1000) break;
        await new Promise(resolveGroup => setTimeout(resolveGroup, 50));
      }
    }
    // Let already queued filesystem events drain before closing the watchers.
    await new Promise(resolveDrain => setTimeout(resolveDrain, 30));
  } finally {
    finished = true; clearTimeout(deadline); clearTimeout(cancellationDeadline); clearInterval(parentCheck); await stopMonitor();
    streams = Object.fromEntries(['stdout', 'stderr'].map((name, i) => [name, { bytes: captured[i].bytes, sha256: captured[i].hash.digest('hex') }]));
    try {
      let replaced = false;
      try {
        assertStorage(spool, spoolStorage);
        replaced = [liveOut, liveErr].some((path, i) => {
          const named = lstatSync(path), opened = fstatSync(fds[i]);
          return !named.isFile() || named.ino !== opened.ino || named.dev !== opened.dev;
        });
      } catch { replaced = true; }
      let restored;
      if (replaced) {
        captureError ||= { code: 'EIO', message: 'live capture spool was replaced; recovered descriptor output may be incomplete' };
        restored = mkdtempSync(join(tmpdir(), 'chalk-verify-recovered-'));
      }
      for (const [i, name] of ['stdout', 'stderr'].entries()) {
        const actual = snapshotStream(fds[i], restored ? join(restored, `${name}.log`) : undefined);
        if (digest(actual) !== digest(streams[name])) captureError ||= { code: 'EIO', message: `${name} spool no longer contains the captured bytes` };
      }
      if (restored) {
        try { assertStorage(spool, spoolStorage); rmSync(spool, { recursive: true, force: true }); } catch { /* never remove a redirected spool */ }
        spool = restored; spoolStorage = storageIdentity(spool); liveOut = join(spool, 'stdout.log'); liveErr = join(spool, 'stderr.log');
      }
    } catch (error) { captureError ||= { code: error.code || 'EIO', message: error.message }; }
    for (const fd of fds) { try { closeSync(fd); } catch (error) { captureError ||= { code: error.code || 'EIO', message: error.message }; } }
  }
  const errorCode = captureError?.code || (cancelled ? 'ECANCELED' : timedOut ? 'ETIMEDOUT' : outcome.errorCode);
  const result = { ...running, ...outcome, status: outcome.exitCode === 0 && !errorCode ? 'pass' : 'fail', errorCode,
    finishedAt: new Date().toISOString(), stdoutPath: liveOut, stderrPath: liveErr,
    inputChanges: [...changes].sort(), monitorError, streams, outputComplete: outputComplete && !captureError, ...(captureError ? { captureError: captureError.message } : {}) };
  // Earlier gate output remains recoverable until the whole verification has validated
  // all archives. A later cleanup gate must not silently destroy a completed gate's logs.
  if (q.receiptPath) result.recovery = { dir: spool, storage: spoolStorage, stdoutPath: liveOut, stderrPath: liveErr };
  // Save the completed outcome before archival: recoverable logs must not lose their command
  // or exit status merely because the final destination is unavailable.
  const recoveryPath = join(spool, 'result.json');
  try { atomicWrite(recoveryPath, JSON.stringify(result) + '\n', spoolStorage); }
  catch (e) { result.recoveryError = e.message; }
  try {
    atomicCopy(liveOut, q.stdoutPath, q.storage); atomicCopy(liveErr, q.stderrPath, q.storage);
    result.stdoutPath = q.stdoutPath; result.stderrPath = q.stderrPath;
    atomicWrite(join(dirname(q.stdoutPath), `${q.gate}.result.json`), JSON.stringify(result) + '\n', q.storage);
  } catch (e) {
    result.archiveError = e.message; result.status = 'fail';
    result.stdoutPath = liveOut; result.stderrPath = liveErr; result.recoveryPath = recoveryPath;
  }
  try { updateReceipt(result, cancelled); }
  catch (e) { result.archiveError ||= e.message; result.status = 'fail'; result.recoveryPath = recoveryPath; }
  if (result.archiveError) {
    try { atomicWrite(recoveryPath, JSON.stringify(result) + '\n', spoolStorage); }
    catch (e) { result.recoveryError = e.message; }
  } else if (!q.receiptPath) {
    try { assertStorage(spool, spoolStorage); rmSync(spool, { recursive: true, force: true }); }
    catch (e) { result.cleanupError = e.message; }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF && process.argv[2] === '--supervise') {
  try { process.stdout.write(JSON.stringify(await supervise(JSON.parse(readFileSync(0, 'utf8'))))); }
  catch (e) { process.stderr.write(e.stack || e.message); process.exitCode = 1; }
}
