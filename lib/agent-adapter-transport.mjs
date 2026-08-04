import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ADAPTER_PROTOCOL_VERSION, redactProviderDiagnostic } from './adapters/shared.mjs';

const STATUSES = new Set(['ok', 'failed', 'timeout', 'unsupported']);

function diagnostic(code, message, retryable = false, level = 'error') {
  return { level, code, message, retryable };
}

function safeUsage(raw, diagnostics) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd', 'turns'];
  const usage = {};
  let invalid = false;
  for (const field of fields) {
    if (raw[field] === undefined) continue;
    const value = Number(raw[field]);
    if (!Number.isFinite(value) || value < 0) invalid = true;
    else usage[field] = value;
  }
  if (invalid) diagnostics.push(diagnostic('invalid-usage', 'adapter returned invalid usage fields; they were discarded', false, 'warning'));
  return Object.keys(usage).length ? usage : null;
}

function safeIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const identity = {};
  for (const field of ['displayName', 'model', 'independenceKey']) if (raw[field] != null && String(raw[field])) identity[field] = String(raw[field]);
  return Object.keys(identity).length ? identity : null;
}

function safeDiagnostics(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((item) => ({
    level: ['info', 'warning', 'error'].includes(item?.level) ? item.level : 'error',
    code: String(item?.code || 'adapter-diagnostic'),
    message: redactProviderDiagnostic(item?.message || ''),
    retryable: Boolean(item?.retryable),
  }));
}

function parseResponse(stdout, expectedRequestId) {
  let response;
  try { response = JSON.parse(String(stdout || '')); }
  catch { return { error: 'adapter stdout was not exactly one JSON response object' }; }
  if (!response || typeof response !== 'object' || Array.isArray(response)) return { error: 'adapter response was not an object' };
  if (response.protocolVersion !== ADAPTER_PROTOCOL_VERSION) return { error: `adapter response protocolVersion must be ${ADAPTER_PROTOCOL_VERSION}` };
  if (response.requestId !== expectedRequestId) return { error: 'adapter response requestId did not match the request' };
  if (!STATUSES.has(response.status)) return { error: `adapter response status was invalid: ${String(response.status)}` };
  return { response };
}

export function invokeProtocolAdapter(role, { profile, instructions, context, contract, cwd, timeoutMs, maxBuffer, env }) {
  const workingDirectory = resolve(cwd || process.cwd());
  const requestId = `req-${randomUUID()}`;
  const envelope = {
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    requestId,
    role,
    instructions: String(instructions || ''),
    context: String(context || ''),
    access: contract.access,
    output: contract.output,
    timeoutMs,
    workingDirectory,
    adapterOptions: profile.options || {},
  };
  const processResult = spawnSync(profile.command, {
    cwd: workingDirectory,
    input: JSON.stringify(envelope),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: timeoutMs,
    maxBuffer,
    env,
    shell: true,
  });
  const parsed = parseResponse(processResult.stdout, requestId);
  if (parsed.error) {
    const raw = [processResult.stderr, processResult.stdout, processResult.error?.message].filter(Boolean).join('\n');
    return {
      status: processResult.error?.code === 'ETIMEDOUT' ? 'timeout' : 'failed', text: '', structured: null, usage: null,
      identity: profile.identity || null, capabilities: null,
      diagnostics: [diagnostic('adapter-transport', `${parsed.error}${raw ? `: ${redactProviderDiagnostic(raw)}` : ''}`, processResult.error?.code !== 'ENOENT')],
    };
  }
  const response = parsed.response;
  const diagnostics = safeDiagnostics(response.diagnostics);
  const reportedIdentity = safeIdentity(response.identity);
  if (processResult.status !== 0 && response.status === 'ok') diagnostics.push(diagnostic('adapter-nonzero', `adapter exited ${processResult.status} after emitting a valid response`, false, 'warning'));
  if (processResult.stderr?.trim()) diagnostics.push(diagnostic('adapter-stderr', redactProviderDiagnostic(processResult.stderr), response.status !== 'ok', response.status === 'ok' ? 'warning' : 'error'));
  return {
    status: response.status,
    text: typeof response.text === 'string' ? response.text : '',
    structured: response.structured ?? null,
    usage: safeUsage(response.usage, diagnostics),
    // Configured identity is the explicit authority. Adapter-reported opaque fields fill only gaps,
    // so a useful runtime display/model cannot erase a user's independence assertion.
    identity: reportedIdentity || profile.identity
      ? { ...(reportedIdentity || {}), ...(profile.identity || {}) }
      : null,
    capabilities: response.capabilities && typeof response.capabilities === 'object' ? response.capabilities : null,
    diagnostics,
  };
}
