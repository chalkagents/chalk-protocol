import {
  adapterDiagnostic, extractJsonObject, parseAdapterRequest, providerFailure, redactProviderDiagnostic,
  responseBase, spawnProvider,
} from './shared.mjs';
import { fileURLToPath } from 'node:url';
import { probeCli } from './probe.mjs';

export const GEMINI_SUPPORTED_ROLES = Object.freeze(['executor', 'planner', 'reviewer']);
export const GEMINI_ADAPTER_MANIFEST = Object.freeze({
  id: 'gemini', displayName: 'Gemini CLI', binary: 'gemini', roles: GEMINI_SUPPORTED_ROLES,
  capabilities: { access: ['read-only', 'workspace-write'], output: ['text', 'json'] },
  command: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL('../../bin/adapters/gemini.mjs', import.meta.url)))}`,
  installCommand: 'npm install -g @google/gemini-cli', authCommand: 'gemini',
  probe: (options) => probeCli({ id: 'gemini', displayName: 'Gemini CLI', binary: 'gemini', versionArgs: ['--version'], installCommand: 'npm install -g @google/gemini-cli', authCommand: 'gemini' }, options),
});

export function geminiArgs(request, options = {}) {
  const args = [
    '--prompt', String(request.instructions || ''), '--output-format', 'json', '--sandbox',
    '--approval-mode', request.access === 'read-only' ? 'plan' : 'yolo',
  ];
  if (options.model) args.push('--model', String(options.model));
  return args;
}

export function parseGeminiJson(raw) {
  let value;
  try { value = JSON.parse(String(raw || '')); } catch { return { error: 'Gemini stdout was not one JSON result' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Gemini JSON result was not an object' };
  const models = value.stats?.models && typeof value.stats.models === 'object' ? value.stats.models : {};
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 };
  let exposedUsage = false;
  for (const metrics of Object.values(models)) {
    const tokens = metrics?.tokens || {};
    const finite = (item) => Number.isFinite(Number(item)) && Number(item) >= 0 ? Number(item) : 0;
    if ([tokens.input, tokens.prompt, tokens.candidates, tokens.cached].some((item) => Number.isFinite(Number(item)))) exposedUsage = true;
    totals.inputTokens += finite(tokens.input ?? tokens.prompt);
    totals.outputTokens += finite(tokens.candidates);
    totals.cacheReadTokens += finite(tokens.cached);
    totals.turns += finite(metrics?.api?.totalRequests);
  }
  return {
    text: typeof value.response === 'string' ? value.response : '',
    usage: exposedUsage ? totals : null,
    model: Object.keys(models)[0] || '',
    error: value.error?.message ? String(value.error.message) : '',
  };
}

export function runGeminiAdapter(raw, env = process.env) {
  const parsed = parseAdapterRequest(raw, GEMINI_SUPPORTED_ROLES);
  if (!parsed.request) return parsed.response;
  const request = parsed.request;
  const options = request.adapterOptions || {};
  const binary = String(options.binary || 'gemini');
  const processResult = spawnProvider(binary, geminiArgs(request, options), request, env);
  if (processResult.error || processResult.status !== 0) return providerFailure(request, 'Gemini', processResult);
  const decoded = parseGeminiJson(processResult.stdout);
  if (decoded.error && !decoded.text) return providerFailure(request, 'Gemini', { ...processResult, stderr: `${processResult.stderr || ''}\n${decoded.error}` });
  const model = options.model ? String(options.model) : decoded.model;
  const identity = { displayName: 'Gemini CLI', ...(model ? { model, independenceKey: `gemini:${model}` } : {}) };
  const base = responseBase(request, identity, request.output.kind === 'json' ? 'adapter-decoded' : 'none');
  if (processResult.stderr?.trim()) base.diagnostics.push(adapterDiagnostic('provider-diagnostic', redactProviderDiagnostic(processResult.stderr), false, 'warning'));
  if (decoded.error) base.diagnostics.push(adapterDiagnostic('gemini-result', redactProviderDiagnostic(decoded.error), true));
  if (request.output.kind === 'json') {
    const structured = extractJsonObject(decoded.text);
    if (!structured) return { ...base, status: 'failed', text: decoded.text, ...(decoded.usage ? { usage: decoded.usage } : {}), diagnostics: [...base.diagnostics, adapterDiagnostic('provider-output', 'Gemini did not return one structured result')] };
    return { ...base, status: 'ok', structured, ...(decoded.usage ? { usage: decoded.usage } : {}) };
  }
  return { ...base, status: 'ok', text: decoded.text, ...(decoded.usage ? { usage: decoded.usage } : {}) };
}
