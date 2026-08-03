import {
  adapterDiagnostic, extractJsonObject, parseAdapterRequest, providerFailure, providerPrompt,
  redactProviderDiagnostic, responseBase, spawnProvider,
} from './shared.mjs';
import { AGENT_ROLES } from '../config.mjs';
import { fileURLToPath } from 'node:url';
import { probeCli } from './probe.mjs';

export const OPENCODE_SUPPORTED_ROLES = AGENT_ROLES;
export const OPENCODE_ADAPTER_MANIFEST = Object.freeze({
  id: 'opencode', displayName: 'OpenCode', binary: 'opencode', roles: OPENCODE_SUPPORTED_ROLES,
  capabilities: { access: ['read-only', 'workspace-write'], output: ['text', 'json', 'none'] },
  command: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL('../../bin/adapters/opencode.mjs', import.meta.url)))}`,
  installCommand: 'npm install -g opencode-ai', authCommand: 'opencode auth login',
  probe: (options) => probeCli({ id: 'opencode', displayName: 'OpenCode', binary: 'opencode', versionArgs: ['--version'], installCommand: 'npm install -g opencode-ai', authCommand: 'opencode auth login' }, options),
});
export function buildRunArgs(prompt, options = {}) {
  const autoArgs = options.auto === false ? [] : ['--auto'];
  const modelArgs = options.model ? ['-m', String(options.model)] : [];
  const attachArgs = options.attach ? ['--attach', String(options.attach)] : [];
  return ['run', ...autoArgs, ...modelArgs, ...attachArgs, prompt];
}

export const extractJson = extractJsonObject;

function openCodeUsage(stdout) {
  const value = extractJsonObject(stdout);
  const raw = value?.usage;
  if (!raw || typeof raw !== 'object') return null;
  const finite = (item) => Number.isFinite(Number(item)) && Number(item) >= 0 ? Number(item) : undefined;
  const usage = {
    inputTokens: finite(raw.inputTokens ?? raw.input_tokens), outputTokens: finite(raw.outputTokens ?? raw.output_tokens),
    cacheReadTokens: finite(raw.cacheReadTokens ?? raw.cache_read_tokens), cacheWriteTokens: finite(raw.cacheWriteTokens ?? raw.cache_write_tokens),
    costUsd: finite(raw.costUsd ?? raw.cost_usd), turns: finite(raw.turns),
  };
  const normalized = Object.fromEntries(Object.entries(usage).filter(([, item]) => item !== undefined));
  return Object.keys(normalized).length ? normalized : null;
}

export function runOpenCodeAdapter(raw, env = process.env) {
  const parsed = parseAdapterRequest(raw, OPENCODE_SUPPORTED_ROLES);
  if (!parsed.request) return parsed.response;
  const request = parsed.request;
  const options = request.adapterOptions || {};
  const binary = String(options.binary || env.CHALK_OPENCODE_BIN || 'opencode');
  const model = options.model || env.CHALK_OPENCODE_MODEL || '';
  const attach = options.attach || env.CHALK_OPENCODE_ATTACH || '';
  const prompt = providerPrompt(request) + (request.output.kind === 'json'
    ? '\n\nIMPORTANT: Respond with ONLY a single JSON object. No prose, explanation, or markdown fences.' : '');
  const args = buildRunArgs(prompt, { model, attach, auto: request.access === 'workspace-write' });
  const secrets = Object.entries(options).filter(([key]) => /key|token|secret|password/i.test(key)).map(([, value]) => value);
  const processResult = spawnProvider(binary, args, { ...request, context: '' }, env);
  const stdout = String(processResult.stdout || '');
  if (processResult.error) return providerFailure(request, 'OpenCode', processResult, secrets);

  const identity = {
    displayName: 'OpenCode',
    ...(model ? { model: String(model) } : {}),
    independenceKey: `opencode:${model || 'default'}`,
  };
  const base = responseBase(request, identity, request.output.kind === 'json' ? 'adapter-decoded' : 'none');
  if (processResult.stderr?.trim()) base.diagnostics.push(adapterDiagnostic('provider-diagnostic', redactProviderDiagnostic(processResult.stderr, secrets), false, 'warning'));
  const usage = openCodeUsage(stdout);
  if (request.output.kind === 'json') {
    const structured = extractJsonObject(stdout);
    if (!structured) return { ...base, status: 'failed', text: stdout, diagnostics: [...base.diagnostics, adapterDiagnostic('provider-output', 'OpenCode did not return one JSON object')] };
    if (processResult.status !== 0) base.diagnostics.push(adapterDiagnostic('provider-nonzero', `OpenCode exited ${processResult.status} after returning a valid structured result`, false, 'warning'));
    return { ...base, status: 'ok', structured, ...(usage ? { usage } : {}) };
  }
  if (processResult.status !== 0) return providerFailure(request, 'OpenCode', processResult, secrets);
  if (request.output.kind === 'none') return { ...base, status: 'ok', ...(usage ? { usage } : {}) };
  return { ...base, status: 'ok', text: stdout, ...(usage ? { usage } : {}) };
}
