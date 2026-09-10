// Cross-platform subprocess boundary. Structured commands stay argv-based; script files are
// launched through the running Node binary, and Windows command shims are resolved explicitly.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join } from 'node:path';

const NODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const WINDOWS_EXTENSIONS = ['.exe', '.com', '.cmd', '.bat'];
const WINDOWS_BUILTINS = new Set([
  'assoc', 'break', 'call', 'cd', 'chdir', 'cls', 'color', 'copy', 'date', 'del', 'dir', 'echo',
  'endlocal', 'erase', 'exit', 'for', 'ftype', 'goto', 'if', 'md', 'mkdir', 'mklink', 'move',
  'path', 'pause', 'popd', 'prompt', 'pushd', 'rd', 'rem', 'ren', 'rename', 'rmdir', 'set',
  'setlocal', 'shift', 'start', 'time', 'title', 'type', 'ver', 'verify', 'vol',
]);
const POSIX_BUILTINS = new Set(['.', 'alias', 'cd', 'echo', 'eval', 'exec', 'export', 'read', 'set', 'shift', 'source', 'trap', 'umask', 'unalias', 'unset']);

// Small shell-word reader for legacy configured command strings. It performs no expansion,
// substitution, redirection, or operator handling; quotes only group literal argv values.
export function commandWords(value) {
  if (Array.isArray(value)) return value.map(String);
  const source = String(value || '').trim();
  const words = [];
  let word = '', quote = '', started = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) { quote = ''; started = true; continue; }
      if (quote === '"' && ch === '\\' && (source[i + 1] === '"' || source[i + 1] === '\\')) word += source[++i];
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (ch === '\\' && /[\\'"\s]/.test(source[i + 1] || '')) { word += source[++i]; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started || word) { words.push(word); word = ''; started = false; }
      continue;
    }
    word += ch; started = true;
  }
  if (quote) throw new Error('unterminated quote in command');
  if (started || word) words.push(word);
  return words;
}

function pathCandidates(command, env, platform) {
  const path = String(env.PATH || env.Path || env.path || '').split(delimiter).filter(Boolean);
  const hasPath = isAbsolute(command) || /[\\/]/.test(command);
  const dirs = hasPath ? [''] : path;
  const extension = extname(command).toLowerCase();
  const extensions = platform === 'win32' && !extension
    // Prefer native Windows shims (npm.cmd) over an adjacent POSIX launcher named `npm`, then
    // fall back to the literal file so portable extensionless Node shebang fixtures still work.
    ? [...String(env.PATHEXT || WINDOWS_EXTENSIONS.join(';')).split(';').filter(Boolean).map((x) => x.toLowerCase()), '']
    : [''];
  return dirs.flatMap((dir) => extensions.map((suffix) => `${dir ? join(dir, command) : command}${suffix}`));
}

export function resolveCommand(command, { env = process.env, platform = process.platform } = {}) {
  const raw = String(command || '');
  for (const candidate of pathCandidates(raw, env, platform)) if (existsSync(candidate)) return candidate;
  return raw;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!text || /[\s&()\[\]{}^=;!'+,`~|<>\"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function launchCommand(command, args = [], options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const resolved = resolveCommand(command, { env, platform });
  const ext = extname(resolved).toLowerCase();
  const spawnOptions = { ...options, env, shell: false };
  delete spawnOptions.platform;
  let nodeScript = NODE_EXTENSIONS.has(ext);
  if (!nodeScript && platform === 'win32' && existsSync(resolved)) {
    try { nodeScript = /^#!.*\bnode(?:\.exe)?\b/i.test(readFileSync(resolved, 'utf8').slice(0, 160)); } catch { /* binary/unreadable */ }
  }
  if (nodeScript) return spawnSync(process.execPath, [resolved, ...args], spawnOptions);
  if (platform === 'win32' && (ext === '.cmd' || ext === '.bat')) {
    const comspec = env.ComSpec || env.COMSPEC || 'cmd.exe';
    const line = [resolved, ...args].map(quoteCmdArg).join(' ');
    return spawnSync(comspec, ['/d', '/s', '/c', line], spawnOptions);
  }
  return spawnSync(resolved, args, spawnOptions);
}

export function launchCommandString(command, options = {}) {
  const [binary, ...args] = commandWords(command);
  if (!binary) return { status: null, stdout: null, stderr: null, error: Object.assign(new Error('empty command'), { code: 'ENOENT' }) };
  return launchCommand(binary, args, options);
}

function needsShell(source, platform) {
  let words;
  try { words = commandWords(source); } catch { return true; }
  const binary = String(words[0] || '').toLowerCase();
  if ((platform === 'win32' ? WINDOWS_BUILTINS : POSIX_BUILTINS).has(binary)) return true;
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) { quote = ''; continue; }
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (platform === 'win32' && ch === '%') return true;
      if (platform !== 'win32' && quote === '"' && (ch === '$' || ch === '`')) return true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '\\') { i++; continue; }
    if (/[|&;<>()*?\n\r]/.test(ch)) return true;
    if (platform === 'win32' ? ch === '%' : ch === '$' || ch === '`') return true;
  }
  return false;
}

export const commandRequiresShell = (source, platform = process.platform) => needsShell(String(source || ''), platform);

// Compatibility-only boundary for user-authored free-form commands (runner hooks and worktree
// setup). The whole string is intentionally delegated to the native shell; structured Git,
// GitHub, adapter, and agent calls use launchCommand/launchCommandString instead.
export function launchShellCommand(command, options = {}) {
  const source = String(command || '');
  const platform = options.platform || process.platform;
  if (!needsShell(source, platform)) return launchCommandString(source, options);
  const spawnOptions = { ...options, shell: true };
  delete spawnOptions.platform;
  return spawnSync(source, spawnOptions);
}
