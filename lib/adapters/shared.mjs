import { spawnSync } from 'node:child_process';

export const ADAPTER_PROTOCOL_VERSION = 'chalk-agent-adapter/1';

export function adapterDiagnostic(code, message, retryable = false, level = 'error') {
  return { level, code, message, retryable };
}

export function redactProviderDiagnostic(value, secrets = []) {
  let text = String(value || '');
  for (const secret of secrets.map(String).filter((item) => item.length >= 4)) {
    text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(-4000);
}

export function parseAdapterRequest(raw, supportedRoles) {
  let request;
  try { request = JSON.parse(String(raw || '')); }
  catch {
    return { request: null, response: failureResponse('unknown', 'failed', 'invalid-request', 'stdin was not one JSON request object') };
  }
  const requestId = String(request?.requestId || 'unknown');
  if (request?.protocolVersion !== ADAPTER_PROTOCOL_VERSION) {
    return { request: null, response: failureResponse(requestId, 'unsupported', 'unsupported-version', `expected ${ADAPTER_PROTOCOL_VERSION}`) };
  }
  if (!supportedRoles.includes(request.role)) {
    return { request: null, response: failureResponse(requestId, 'unsupported', 'unsupported-role', `unsupported role ${String(request.role || '(missing)')}`) };
  }
  if (!['read-only', 'workspace-write'].includes(request.access)) {
    return { request: null, response: failureResponse(requestId, 'unsupported', 'unsupported-access', `unsupported access ${String(request.access || '(missing)')}`) };
  }
  if (!['text', 'json', 'none'].includes(request.output?.kind)) {
    return { request: null, response: failureResponse(requestId, 'unsupported', 'unsupported-output', `unsupported output ${String(request.output?.kind || '(missing)')}`) };
  }
  return { request, response: null };
}

export function failureResponse(requestId, status, code, message, retryable = false) {
  return {
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    requestId: String(requestId || 'unknown'),
    status,
    diagnostics: [adapterDiagnostic(code, message, retryable)],
  };
}

export function responseBase(request, identity, structuredOutput = 'none') {
  return {
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    requestId: String(request.requestId),
    identity,
    capabilities: { accessEnforced: request.access, structuredOutput },
    diagnostics: [],
  };
}

export function providerPrompt(request) {
  return `# Role instructions\n\n${String(request.instructions || '').trim()}\n\n# Run context\n\n${String(request.context || '')}`;
}

export function extractJsonObject(stdout) {
  const text = String(stdout || '').replace(/```(?:json)?/gi, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const candidate = balancedObject(text, i);
    if (candidate === null) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* keep scanning */ }
  }
  return null;
}

function balancedObject(text, start) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function spawnProvider(binary, args, request, env = process.env) {
  return spawnSync(binary, args, {
    cwd: request.workingDirectory,
    input: String(request.context || ''),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: request.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env,
  });
}

export function providerFailure(request, provider, processResult, secrets = []) {
  const raw = [processResult.stdout, processResult.stderr, processResult.error?.message].filter(Boolean).join('\n');
  const safe = redactProviderDiagnostic(raw, secrets);
  const timeout = processResult.error?.code === 'ETIMEDOUT';
  const missing = processResult.error?.code === 'ENOENT';
  return {
    ...responseBase(request, null),
    status: timeout ? 'timeout' : 'failed',
    diagnostics: [adapterDiagnostic(
      timeout ? 'provider-timeout' : missing ? 'provider-command-not-found' : 'provider-exit',
      `${provider} invocation failed${safe ? `: ${safe}` : ''}`,
      !missing,
    )],
  };
}
