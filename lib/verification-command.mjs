// A synchronous API backed by an asynchronous supervisor. The supervisor owns the command,
// watches its inputs, and can archive an interrupted run even if the calling CLI is killed.
import { spawn, spawnSync } from 'node:child_process';
import fsAsync from 'node:fs/promises';
import { Worker, MessageChannel, receiveMessageOnPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, writeSync, openSync, closeSync, rmSync, mkdirSync, mkdtempSync, watch, lstatSync, statSync, readdirSync, fstatSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, relative, resolve, sep, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sourceIdentity, saveVerificationRecord, canonicalCwd, membershipIdentity, snapshotStream, storageIdentity, assertStorage, atomicCopy, atomicWrite, digest, fileIdentityAsync, membershipIdentityAsync, canonicalCwdAsync, assertStorageAsync, directoryIdentity, isProtectedVerificationPath, exactStatIdentity, exactStatMetadata } from './verification-record.mjs';

const SELF = fileURLToPath(import.meta.url);
const MAX_VERIFICATION_WATCHERS = 48;
export const DEFAULT_VERIFICATION_TIMEOUT_MS = 20 * 60 * 1000;

// Node does not expose Windows Job Objects. This small PowerShell-hosted P/Invoke
// runner creates the shell suspended, assigns it before any user code can escape,
// and keeps every descendant in a kill-on-close job. The owner process below stays
// outside the job so the supervisor retains an independent cancellation handle.
const WINDOWS_JOB_RUNNER = String.raw`$native = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ChalkWindowsJob {
  const uint CREATE_SUSPENDED = 0x00000004;
  const uint CREATE_NO_WINDOW = 0x08000000;
  const uint STARTF_USESTDHANDLES = 0x00000100;
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
  const int JobObjectBasicAccountingInformation = 1;
  const int JobObjectExtendedLimitInformation = 9;
  const int STD_INPUT_HANDLE = -10;
  const int STD_OUTPUT_HANDLE = -11;
  const int STD_ERROR_HANDLE = -12;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public uint dwX;
    public uint dwY;
    public uint dwXSize;
    public uint dwYSize;
    public uint dwXCountChars;
    public uint dwYCountChars;
    public uint dwFillAttribute;
    public uint dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public uint dwProcessId;
    public uint dwThreadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION {
    public long TotalUserTime;
    public long TotalKernelTime;
    public long ThisPeriodTotalUserTime;
    public long ThisPeriodTotalKernelTime;
    public uint TotalPageFaultCount;
    public uint TotalProcesses;
    public uint ActiveProcesses;
    public uint TotalTerminatedProcesses;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateJobObject(IntPtr attributes, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool SetInformationJobObject(IntPtr job, int infoClass,
    ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool QueryInformationJobObject(IntPtr job, int infoClass,
    ref JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info, uint length, IntPtr returnedLength);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcess(string applicationName, StringBuilder commandLine,
    IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles,
    uint creationFlags, IntPtr environment, string currentDirectory,
    ref STARTUPINFO startupInfo, out PROCESS_INFORMATION processInformation);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern uint ResumeThread(IntPtr thread);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool CloseHandle(IntPtr handle);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr GetStdHandle(int standardHandle);

  static void Check(bool value) {
    if (!value) throw new Win32Exception(Marshal.GetLastWin32Error());
  }

  public static int Run(string commandInterpreter, string script, string cwd, string control, string token) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    PROCESS_INFORMATION process = new PROCESS_INFORMATION();
    try {
      var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
      limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      Check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits,
        (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))));

      var startup = new STARTUPINFO();
      startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
      startup.dwFlags = STARTF_USESTDHANDLES;
      startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
      startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
      startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
      var line = new StringBuilder("\"" + commandInterpreter + "\" /d /s /c call \"" + script + "\"");
      Check(CreateProcess(commandInterpreter, line, IntPtr.Zero, IntPtr.Zero, true,
        CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref startup, out process));
      Check(AssignProcessToJobObject(job, process.hProcess));
      if (ResumeThread(process.hThread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
      WaitForSingleObject(process.hProcess, UInt32.MaxValue);
      uint exitCode;
      Check(GetExitCodeProcess(process.hProcess, out exitCode));
      File.WriteAllText(control, token + ":" + exitCode.ToString());
      // The shell has exited. Drop only the keeper's copies so an ignored worker
      // cannot delay the next gate; descendants that inherited output retain theirs.
      CloseHandle(GetStdHandle(STD_OUTPUT_HANDLE));
      CloseHandle(GetStdHandle(STD_ERROR_HANDLE));

      var accounting = new JOBOBJECT_BASIC_ACCOUNTING_INFORMATION();
      do {
        Check(QueryInformationJobObject(job, JobObjectBasicAccountingInformation, ref accounting,
          (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)), IntPtr.Zero));
        if (accounting.ActiveProcesses > 0) Thread.Sleep(10);
      } while (accounting.ActiveProcesses > 0);
      return unchecked((int)exitCode);
    } finally {
      if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
      if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
      CloseHandle(job);
    }
  }
}
'@
Add-Type -TypeDefinition $native
$script = $env:CHALK_VERIFY_SCRIPT
$control = $env:CHALK_JOB_CONTROL
$token = $env:CHALK_JOB_TOKEN
Remove-Item Env:CHALK_VERIFY_SCRIPT, Env:CHALK_JOB_CONTROL, Env:CHALK_JOB_TOKEN -ErrorAction SilentlyContinue
try { exit [ChalkWindowsJob]::Run($env:ComSpec, $script, (Get-Location).Path, $control, $token) }
catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }
`;

const metadataOf = stat => digest(stat.isDirectory() ? { directory: true, ...exactStatIdentity(stat) } : {
  ...exactStatMetadata(stat), size: String(stat.size), mode: String(stat.mode),
});
// Gitlink directory timestamps can change for legitimately ignored generated output.
const metadataStamp = path => {
  try { return metadataOf(lstatSync(path, { bigint: true })); }
  catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
};
const metadataStampAsync = async path => {
  // Cross-boundary metadata must use the same binding as metadataStamp: on Windows,
  // Node's synchronous and promise stat APIs can report different file identifiers.
  try { return metadataOf(lstatSync(path, { bigint: true })); }
  catch (error) { if (error.code === 'ENOENT') return 'deleted'; throw error; }
};
const sameDirectory = (left, right) => {
  try {
    const a = lstatSync(left, { bigint: true }), b = lstatSync(right, { bigint: true });
    return a.isDirectory() && b.isDirectory() && a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
};
const withinDirectory = (path, ancestor) => {
  let dir = path;
  try { if (!lstatSync(dir).isDirectory()) dir = dirname(dir); }
  catch { dir = dirname(dir); }
  for (;;) {
    if (sameDirectory(dir, ancestor)) return true;
    if (dirname(dir) === dir) return false;
    dir = dirname(dir);
  }
};

export function classifyGitIgnoreRule(rule) {
  if (rule.status === 1) return { kind: 'source-change' };
  const pattern = rule.stdout?.split('\0')[2];
  if (rule.status !== 0 || !pattern || pattern.startsWith('!')) throw new Error('cannot establish changed input ignore rule');
  return { kind: 'ignored', pattern };
}

export function runVerificationCommand(request) {
  const supervisorResult = spawnSync(process.execPath, [SELF, '--supervise'], {
    input: JSON.stringify({ ...request, parentPid: process.pid }), encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // The supervisor enforces the command deadline and owns cancellation/archival.
  });
  if (process.env.CHALK_WINDOWS_DEBUG && supervisorResult.stderr) process.stderr.write(`[chalk supervisor]\n${supervisorResult.stderr}`);
  if (supervisorResult.error || supervisorResult.status !== 0) throw new Error(`verification supervisor failed: ${supervisorResult.error?.message || supervisorResult.stderr || supervisorResult.signal || supervisorResult.status}`);
  const result = JSON.parse(supervisorResult.stdout);
  if (process.env.CHALK_WINDOWS_DEBUG && result.status === 'fail') {
    try { process.stderr.write(`[chalk command ${result.gate}]\n${readFileSync(result.stderrPath, 'utf8')}\n`); } catch { /* diagnostic only */ }
  }
  return result;
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
        const hasInput = input.length > 0;
        child = spawn('git', args, { cwd, stdio: [hasInput ? 'pipe' : 'ignore', 'pipe', 'ignore'] });
        timer = setTimeout(() => { failure = 'Git classification timed out'; child.kill('SIGKILL'); finish(null); }, 10000);
        child.once('error', error => { failure = error.message; finish(null); });
        child.stdout.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) { failure = 'Git classification output exceeded limit'; child.kill('SIGKILL'); finish(null); }
          else chunks.push(chunk);
        });
        child.stdout.on('error', error => { failure = error.message; child.kill('SIGKILL'); finish(null); });
        child.once('close', finish);
        if (hasInput) {
          child.stdin.on('error', error => { failure = error.message; });
          child.stdin.end(input);
        }
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
    return isProtectedVerificationPath(abs, hidden) || path.split('/').includes('.git') ||
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
  const watchers = [], pending = new Set(), eventAuthorities = new Set(), git = gitClassifier();
  const sourceWatcherError = error => {
    const abs = error.path ? resolve(root, String(error.path)) : '';
    if (error.code === 'ENOENT' && abs.startsWith(root + sep)) {
      const parts = relative(root, abs).split(sep);
      const gitIndex = parts.indexOf('.git');
      if (gitIndex >= 0) {
        changed(`git-membership:${resolve(root, ...parts.slice(0, gitIndex + 1))}`);
        return;
      }
    }
    failed(`source watcher: ${error.message}`);
  };
  const observe = action => {
    const work = Promise.resolve().then(action).catch(error => failed(error.message));
    pending.add(work); work.finally(() => pending.delete(work));
  };
  const sourceEvent = (dir, filename) => observe(async () => {
    if (!filename) { failed('input watcher did not identify the changed path'); return; }
    const abs = join(dir, String(filename)), path = relative(root, abs).split(sep).join('/');
    if (basename(abs) === '.git') { changed(`git-membership:${abs}`); return; }
    if (excluded(path)) return;
    // A non-recursive Windows watch on a parent can report only the child directory
    // name for a deeper change. The child has its own watch, while its endpoint
    // namespace identity covers remove/replace, so ignore this coarse duplicate.
    if (dirs.has(abs)) return;
    if (basename(abs) === '.gitignore') { changed(path); return; }
    if (!known.has(path) && initial.method === 'git') {
      let parent = dirname(abs);
      while (parent !== root) {
        try { if ((await fsAsync.lstat(parent)).isDirectory()) break; }
        catch (error) { if (error.code !== 'ENOENT') { failed(error.message); return; } }
        parent = dirname(parent);
      }
      const name = relative(parent, abs).split(sep).join('/');
      // Resolve ignores in the closest existing directory, including a submodule's own repo.
      const ignored = await git(['check-ignore', '--no-index', '--', name], parent);
      if (ignored.status === 0) {
        // check-ignore consults the current file type. A queued file event can now
        // point at a replacement directory, so a directory-only match proves nothing
        // about that event. Only type-independent ignore rules can exclude it.
        const rule = await git(['check-ignore', '--no-index', '-v', '-z', '--stdin'], parent, name + '\0');
        // The policy can be restored between the two Git queries. In that case the
        // path is no longer ignored, so conservatively retain the source change; the
        // first query already proved that classification changed during the command.
        const classification = classifyGitIgnoreRule(rule);
        if (classification.kind === 'source-change') { changed(path); return; }
        if (classification.pattern.endsWith('/')) {
          // Every event below an ignored ancestor necessarily had a directory at
          // that ancestor. Ambiguity concerns the changed leaf itself, not its
          // parent (e.g. build/output.log beside force-tracked build/.gitkeep).
          const ancestor = await git(['check-ignore', '--no-index', '--', '.'], parent);
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
          const directory = await git(['check-ignore', '--no-index', '--', name + '/'], parent);
          if (directory.status === 0) { failed(`changed path vanished before its type could be established: ${path}; keep generated directories present during verification or explicitly ignore both file and directory forms`); return; }
          if (directory.status !== 1) { failed('cannot classify removed input directory'); return; }
        } else { failed(e.message); return; }
      }
    }
    changed(path);
  });
  let recursiveSource = false;
  try {
    // Platforms with recursive fs.watch support can cover the whole source tree with
    // one handle. This matters when verification commands themselves start nested
    // verifiers: two independent monitors must fit inside conservative FD limits.
    if (process.platform !== 'win32') {
      try {
        const w = watch(root, { recursive: true }, (_event, filename) => sourceEvent(root, filename));
        w.on('error', sourceWatcherError); watchers.push(w); recursiveSource = true;
      } catch (error) {
        if (!['ERR_FEATURE_UNAVAILABLE_ON_PLATFORM', 'ERR_INVALID_ARG_VALUE'].includes(error.code)) throw error;
      }
    }
    // Explicit watches bypass .git/source exclusions. Watch the nearest existing parent
    // when a policy file does not exist yet, so create-use-delete changes are retained.
    const policies = new Map();
    for (const path of [...Object.keys(initial.policyInputs || {}), ...Object.keys(initial.membershipInputs || {})]) {
      const membership = initial.membershipInputs?.[path];
      const withinRoot = withinDirectory(path, root);
      const internalIgnore = Object.hasOwn(initial.policyInputs || {}, path) && basename(path) === '.gitignore';
      // Source watchers retain internal .gitignore and repository-locator transitions. When
      // the bounded fallback cannot watch every directory, namespace identities retain those
      // same create/remove transitions at the completion boundary.
      if (withinRoot && (membership?.kind === 'locator' || internalIgnore)) { eventAuthorities.add(path); continue; }
      let parent = dirname(path);
      while (true) {
        try { if (statSync(parent).isDirectory()) break; throw new Error('invalid policy parent'); }
        catch (e) { if (e.code !== 'ENOENT' || dirname(parent) === parent) throw e; parent = dirname(parent); }
      }
      if (!policies.has(parent)) policies.set(parent, []);
      policies.get(parent).push(path);
    }
    const selectedDirectories = Object.entries(initial.membershipInputs || {}).flatMap(([path, input]) => {
      if (input.kind !== 'locator') return [];
      try { return lstatSync(path).isDirectory() ? [path] : []; }
      catch { return []; }
    });
    for (const [parent, paths] of policies) {
      // A Windows directory watch prevents that directory from being renamed. Keep
      // repository internals handle-free, but use notifications for external policy
      // parents and selector parents where the watched directory itself is not mutable.
      if (process.platform === 'win32' && (withinDirectory(parent, root) || selectedDirectories.some(dir => withinDirectory(parent, dir)))) continue;
      if (watchers.length >= MAX_VERIFICATION_WATCHERS) break;
      const w = watch(parent, (_event, filename) => observe(async () => {
        if (!filename) { failed('ignore-policy watcher did not identify the changed path'); return; }
        const path = join(parent, String(filename));
        if (paths.some(p => p === path || p.startsWith(path + sep))) {
          const membership = initial.membershipInputs?.[path];
          if (membership) {
            const actual = await canonicalCwdAsync(path);
            if (isProtectedVerificationPath(actual, hidden)) { failed('membership path moved into excluded content'); return; }
          }
          // A locator can be created and restored before this callback runs. The event
          // itself is authoritative; comparing only the restored endpoint would lose
          // the temporary repository selection the watcher exists to retain.
          if (Object.hasOwn(sharedStamps, path)) {
            try { if (await fileIdentityAsync(path) === sharedStamps[path]) return; }
            catch (error) { if (error.code !== 'ENOENT') failed(error.message); }
          }
          changed(`${label(path)}:${path}`);
        }
      }));
      w.on('error', error => failed(`policy watcher ${parent}: ${error.message}`)); watchers.push(w);
      for (const path of paths) eventAuthorities.add(path);
    }
    for (const dir of recursiveSource ? [] : dirs) {
      if (watchers.length >= MAX_VERIFICATION_WATCHERS) break;
      try {
        const w = watch(dir, (_event, filename) => sourceEvent(dir, filename));
        w.on('error', error => failed(`source watcher ${dir}: ${error.message}`)); watchers.push(w);
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
  const checkAuthorities = async () => {
    for (const [path, identity] of Object.entries(initial.policyInputs || {})) {
      const actual = await canonicalCwdAsync(path);
      if (isProtectedVerificationPath(actual, hidden)) { failed('policy path moved into excluded content'); continue; }
      let current;
      try { current = await fileIdentityAsync(path); }
      catch (error) { if (error.code === 'ENOENT') current = 'deleted'; else { failed(error.message); continue; } }
      if (current !== identity) changed(`${label(path)}:${path}`);
    }
    for (const [path, input] of Object.entries(initial.membershipInputs || {})) {
      const actual = await canonicalCwdAsync(path);
      if (isProtectedVerificationPath(actual, hidden)) { failed('membership path moved into excluded content'); continue; }
      let current;
      try { current = input.kind === 'shared' ? await fileIdentityAsync(path) : await membershipIdentityAsync(path, input.kind); }
      catch (error) { if (error.code === 'ENOENT') current = 'deleted'; else { failed(error.message); continue; } }
      if (current !== (sharedStamps[path] || input.identity)) changed(`git-membership:${path}`);
    }
  };
  const authorityStamps = Object.fromEntries([
    ...Object.keys(initial.policyInputs || {}), ...Object.keys(initial.membershipInputs || {}),
  ].filter(path => !eventAuthorities.has(path)).map(path => {
    try { return [path, metadataStamp(path)]; }
    catch (error) { if (error.code === 'ENOENT') return [path, 'deleted']; throw error; }
  }));
  const pollAuthorities = () => {
    for (const path of Object.keys(authorityStamps)) {
      let current;
      try { current = metadataStamp(path); }
      catch (error) { if (error.code === 'ENOENT') current = 'deleted'; else { failed(error.message); continue; } }
      if (current !== authorityStamps[path]) changed(`${label(path)}:${path}`);
    }
  };
  let authorityTimer = null;
  if (process.platform === 'win32') {
    // ReadDirectoryChangesW keeps repository directories open and can prevent selector
    // replacement. Poll metadata without opening file contents; safe external parents
    // above still provide event coverage for create-use-delete transitions.
    let polling = false;
    authorityTimer = setInterval(() => {
      if (polling) return;
      polling = true;
      const work = Promise.resolve().then(pollAuthorities).catch(error => failed(error.message)).finally(() => {
        polling = false; pending.delete(work);
      });
      pending.add(work);
    }, 25);
  }
  const check = async () => {
    // Persistent/restored input writes need not wait for platform notification delivery.
    // Metadata checks keep the completion boundary cheap while supplementing transient-event
    // coverage. The controller separately re-hashes the observed manifest's content.
    for (const [path, stamp] of Object.entries(sourceStamps)) {
      const abs = resolve(root, path), actual = await canonicalCwdAsync(abs);
      if (isProtectedVerificationPath(actual, hidden)) { failed('input path moved into excluded content'); continue; }
      try { if (await metadataStampAsync(abs) !== stamp) changed(path); }
      catch (error) { failed(error.message); }
    }
    // Filesystem notifications can arrive after a short command's drain window. Record
    // endpoint membership changes as well; the watcher still covers restored transitions.
    await checkAuthorities();
  };
  const checkNamespaces = () => {
    for (const [path, identity] of Object.entries(initial.namespaceInputs || {})) {
      if (canonicalCwd(path) !== path) { failed('source-directory namespace redirected during verification'); continue; }
      try { if (directoryIdentity(path) !== identity) changed(`source-directory:${path}`); }
      catch (error) { failed(error.message); }
    }
  };
  const close = () => { clearInterval(authorityTimer); for (const watcher of watchers) watcher.close(); };
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
    const stat = await fsAsync.lstat(path, { bigint: true });
    if (!stat.isFile()) throw new Error('archive is not a regular file');
    return metadataOf(stat);
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

async function ownWindowsCommand(requestPath) {
  const request = JSON.parse(readFileSync(requestPath, 'utf8'));
  const token = randomBytes(32).toString('hex');
  let command, reported = false, controlTimer, finishing = false;
  const report = result => {
    if (reported) return;
    reported = true; clearInterval(controlTimer);
    const closeOutputs = () => {
      try { closeSync(3); } catch { /* already closed */ }
      try { closeSync(4); } catch { /* already closed */ }
    };
    if (process.connected) process.send({ type: 'result', ...result });
    closeOutputs();
  };
  process.on('message', message => { if (message?.type === 'finish') { finishing = true; process.exit(0); } });
  process.on('disconnect', () => {
    if (finishing) return;
    if (command?.pid) spawnSync('taskkill', ['/pid', String(command.pid), '/T', '/F'], { stdio: 'ignore' });
    process.exit(1);
  });
  try {
    // The PowerShell host owns a kill-on-close Job Object. It does not return until
    // every descendant exits, while the Node owner keeps the IPC cancellation seam.
    command = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', request.runner], {
      cwd: request.cwd, windowsHide: true, env: { ...process.env, CHALK_VERIFY_SCRIPT: request.script, CHALK_JOB_CONTROL: request.control, CHALK_JOB_TOKEN: token }, stdio: ['ignore', 3, 4],
    });
    command.once('error', error => report({ exitCode: null, signal: null, errorCode: error.code || 'ESPAWN' }));
    command.once('exit', (exitCode, signal) => report({ exitCode, signal, errorCode: null }));
    controlTimer = setInterval(() => {
      try {
        const value = readFileSync(request.control, 'utf8'), prefix = `${token}:`;
        if (!value.startsWith(prefix) || !/^\d+$/.test(value.slice(prefix.length))) throw new Error('invalid Windows job outcome');
        report({ exitCode: Number(value.slice(prefix.length)), signal: null, errorCode: null });
      } catch (error) { if (error.code !== 'ENOENT') report({ exitCode: null, signal: null, errorCode: 'EJOBRESULT' }); }
    }, 10);
  } catch (error) { report({ exitCode: null, signal: null, errorCode: error.code || 'ESPAWN' }); }
}

function writeIsolatedFile(path, contents) {
  // A capture-failure test intentionally replaces fs.writeSync in this supervisor.
  // Prepare Windows owner artifacts in a clean helper so that replacement reaches
  // command capture, not the setup files required to launch the command.
  const writer = spawnSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1],require("node:fs").readFileSync(0))', path], {
    input: contents, stdio: ['pipe', 'ignore', 'pipe'],
  });
  if (writer.error || writer.status !== 0) throw writer.error || new Error(writer.stderr?.toString() || 'verification setup writer failed');
}

async function supervise(request) {
  const root = canonicalCwd(request.cwd), changes = new Set();
  let monitorError = null, captureError = null, cancelled = false, timedOut = false, child, outputReaders = [], finished = false;
  let spool = mkdtempSync(join(tmpdir(), 'chalk-verify-output-')), spoolStorage = storageIdentity(spool);
  let liveOut = join(spool, 'stdout.log'), liveErr = join(spool, 'stderr.log');
  const fds = [openSync(liveOut, 'w+', 0o600), openSync(liveErr, 'w+', 0o600)];
  const captured = fds.map(() => ({ bytes: 0, hash: createHash('sha256') }));
  let streams;
  const startedAt = new Date().toISOString();
  mkdirSync(dirname(request.stdoutPath), { recursive: true, mode: 0o700 });
  request.storage ||= storageIdentity(dirname(request.stdoutPath));
  const timeoutMs = request.timeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  const running = { gate: request.gate, status: 'running', cmd: request.cmd, timeoutMs, startedAt, stdoutPath: liveOut, stderrPath: liveErr };
  // Publish recoverable live log references before starting the command.
  const updateReceipt = (gate, interrupted = false) => {
    if (!request.receiptPath) return;
    assertStorage(dirname(request.receiptPath), request.storage);
    const record = JSON.parse(readFileSync(request.receiptPath, 'utf8'));
    const list = record[request.section || 'toolchain'] || [];
    const index = list.findIndex(item => item.gate === request.gate);
    if (index < 0) list.push(gate); else list[index] = { ...list[index], ...gate };
    record[request.section || 'toolchain'] = list;
    if (interrupted) Object.assign(record, { status: 'interrupted', green: false, freshness: 'unknown', finishedAt: new Date().toISOString(), error: 'verification controller exited before completion' });
    saveVerificationRecord({ path: request.receiptPath, storage: request.storage }, record);
  };
  let stopMonitor = () => {};
  try { updateReceipt(running); stopMonitor = monitorInputs(root, request.proto || {}, path => changes.add(path), error => { monitorError = error; }, request.monitorSource); }
  catch (e) { monitorError = e.message; }
  const killTree = () => {
    if (!child?.pid || finished) return;
    if (process.platform === 'win32') {
      const killed = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], process.env.CHALK_WINDOWS_DEBUG ? { encoding: 'utf8' } : { stdio: 'ignore' });
      if (process.env.CHALK_WINDOWS_DEBUG) process.stderr.write(`[chalk taskkill ${child.pid}] status=${killed.status} error=${killed.error?.message || ''}\n${killed.stdout || ''}${killed.stderr || ''}`);
    }
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } }
  };
  const cancel = () => { cancelled = true; killTree(); boundCancellation(); };
  const failCapture = error => { captureError ||= { code: error.code || 'EIO', message: error.message }; killTree(); boundCancellation(); };
  process.on('SIGTERM', cancel); process.on('SIGINT', cancel);
  const parentCheck = setInterval(() => {
    try { process.kill(request.parentPid, 0); }
    catch (e) {
      // Windows reports several error codes for a process that disappeared while its
      // synchronous child is still running. The controller and supervisor share a user,
      // so any failed liveness probe means the controller can no longer own this run.
      if (process.platform === 'win32' || e.code === 'ESRCH') cancel();
    }
    if (process.platform !== 'win32' && process.ppid !== request.parentPid) cancel();
  }, 100);
  let deadline, cancellationDeadline, cancellationStarted, finishCommand, outputComplete = true;
  const boundCancellation = () => {
    if (cancellationDeadline) return;
    cancellationStarted = Date.now();
    cancellationDeadline = setTimeout(() => {
      outputComplete = false;
      for (const stream of outputReaders) stream?.destroy();
      finishCommand?.({ exitCode: child?.exitCode ?? null, signal: child?.signalCode ?? null, errorCode: null });
    }, 1000);
  };
  let outcome;
  try {
    outcome = await new Promise(resolveResult => {
      finishCommand = resolveResult;
      // Pipes remain open while ordinary descendants inherit them, even after the shell exits.
      // Stream chunks to disk immediately; neither capture size nor shell lifetime truncates logs.
      if (process.platform === 'win32') {
        const commandScript = join(spool, 'command.cmd'), jobRunner = join(spool, 'windows-job.ps1'), control = join(spool, 'windows-job.result');
        writeIsolatedFile(commandScript, `@echo off\r\n${request.cmd}\r\nexit /b %errorlevel%\r\n`);
        writeIsolatedFile(jobRunner, WINDOWS_JOB_RUNNER);
        const commandRequest = join(spool, 'command.json');
        writeIsolatedFile(commandRequest, JSON.stringify({ cwd: root, script: commandScript, runner: jobRunner, control }));
        child = spawn(process.execPath, [SELF, '--own-windows-command', commandRequest], {
          cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'ipc'],
        });
        outputReaders = [child.stdio[3], child.stdio[4]];
      } else {
        child = spawn(request.cmd, { cwd: root, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        outputReaders = [child.stdout, child.stderr];
      }
      const append = (index, chunk) => { if (captureError) return;
        captured[index].bytes += chunk.length; captured[index].hash.update(chunk);
        const fd = fds[index]; try { for (let offset = 0; offset < chunk.length;) {
        const written = writeSync(fd, chunk, offset, chunk.length - offset);
        if (!written) throw new Error('verification log write made no progress');
        offset += written;
      } } catch (error) { failCapture(error); } };
      outputReaders[0].on('data', chunk => append(0, chunk));
      outputReaders[1].on('data', chunk => append(1, chunk));
      outputReaders[0].on('error', failCapture); outputReaders[1].on('error', failCapture);
      deadline = setTimeout(() => { timedOut = true; killTree(); boundCancellation(); }, timeoutMs);
      if (process.platform === 'win32') {
        let rootOutcome = null, ended = 0, settled = false;
        const finish = result => {
          if (settled) return;
          settled = true;
          if (child.connected) { try { child.send({ type: 'finish' }); } catch { /* owner exited */ } }
          resolveResult(result);
        };
        const maybeFinish = () => { if (rootOutcome && ended === 2) finish(rootOutcome); };
        child.on('message', message => { if (message?.type === 'result') { rootOutcome = message; maybeFinish(); } });
        outputReaders[0].once('end', () => { ended++; maybeFinish(); });
        outputReaders[1].once('end', () => { ended++; maybeFinish(); });
        child.once('error', error => finish({ exitCode: null, signal: null, errorCode: error.code || 'ESPAWN' }));
        child.once('close', (exitCode, signal) => finish(rootOutcome || { exitCode, signal, errorCode: null }));
      } else {
        child.once('error', e => resolveResult({ exitCode: null, signal: null, errorCode: e.code || 'ESPAWN' }));
        child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal, errorCode: null }));
      }
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
          const named = lstatSync(path, { bigint: true }), opened = fstatSync(fds[i], { bigint: true });
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
  if (request.receiptPath) result.recovery = { dir: spool, storage: spoolStorage, stdoutPath: liveOut, stderrPath: liveErr };
  // Save the completed outcome before archival: recoverable logs must not lose their command
  // or exit status merely because the final destination is unavailable.
  const recoveryPath = join(spool, 'result.json');
  try { atomicWrite(recoveryPath, JSON.stringify(result) + '\n', spoolStorage); }
  catch (e) { result.recoveryError = e.message; }
  try {
    atomicCopy(liveOut, request.stdoutPath, request.storage); atomicCopy(liveErr, request.stderrPath, request.storage);
    result.stdoutPath = request.stdoutPath; result.stderrPath = request.stderrPath;
    atomicWrite(join(dirname(request.stdoutPath), `${request.gate}.result.json`), JSON.stringify(result) + '\n', request.storage);
  } catch (e) {
    result.archiveError = e.message; result.status = 'fail';
    result.stdoutPath = liveOut; result.stderrPath = liveErr; result.recoveryPath = recoveryPath;
  }
  try { updateReceipt(result, cancelled); }
  catch (e) { result.archiveError ||= e.message; result.status = 'fail'; result.recoveryPath = recoveryPath; }
  if (result.archiveError) {
    try { atomicWrite(recoveryPath, JSON.stringify(result) + '\n', spoolStorage); }
    catch (e) { result.recoveryError = e.message; }
  } else if (!request.receiptPath) {
    try { assertStorage(spool, spoolStorage); rmSync(spool, { recursive: true, force: true }); }
    catch (e) { result.cleanupError = e.message; }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  if (process.argv[2] === '--own-windows-command') await ownWindowsCommand(process.argv[3]);
  else if (process.argv[2] === '--supervise') {
    try {
      const json = JSON.stringify(await supervise(JSON.parse(readFileSync(0, 'utf8'))));
      // Relay through a clean child so a deliberately replaced fs.writeSync can fail
      // capture without also corrupting the supervisor's in-memory result channel.
      const relay = spawnSync(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: json, stdio: ['pipe', 'inherit', 'inherit'] });
      if (relay.error || relay.status !== 0) throw relay.error || new Error('verification result relay failed');
    }
    catch (e) { process.stderr.write(e.stack || e.message); process.exitCode = 1; }
  }
}
