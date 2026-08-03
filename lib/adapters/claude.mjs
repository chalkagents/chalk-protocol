import {
  adapterDiagnostic, extractJsonObject, parseAdapterRequest, providerFailure, redactProviderDiagnostic,
  responseBase, spawnProvider,
} from './shared.mjs';
import { AGENT_ROLES } from '../config.mjs';

export const CLAUDE_SUPPORTED_ROLES = AGENT_ROLES;
const MAX_TURNS = { executor: 40, planner: 30, reviewer: 20, retro: 20 };

export function claudeArgs(request, options = {}) {
  const args = ['-p', '--system-prompt', String(request.instructions || ''), '--output-format', 'json'];
  args.push('--permission-mode', request.access === 'workspace-write' ? 'acceptEdits' : 'plan');
  const model = options.model;
  if (model) args.push('--model', String(model));
  const turns = Number(options.maxTurns || MAX_TURNS[request.role] || 20);
  if (Number.isFinite(turns) && turns > 0) args.push('--max-turns', String(turns));
  return args;
}

export function parseClaudeEnvelope(raw) {
  const text = String(raw || '').trim();
  let value;
  try { value = JSON.parse(text); }
  catch {
    for (const line of text.split('\n').reverse()) {
      try { value = JSON.parse(line); break; } catch { /* try an earlier line */ }
    }
  }
  if (!value || value.type !== 'result' || typeof value.result !== 'string') return null;
  const usage = value.usage || {};
  const finite = (item) => Number.isFinite(Number(item)) && Number(item) >= 0 ? Number(item) : undefined;
  const normalized = {
    inputTokens: finite(usage.input_tokens), outputTokens: finite(usage.output_tokens),
    cacheReadTokens: finite(usage.cache_read_input_tokens), cacheWriteTokens: finite(usage.cache_creation_input_tokens),
    costUsd: finite(value.total_cost_usd), turns: finite(value.num_turns),
  };
  return { text: value.result, usage: Object.fromEntries(Object.entries(normalized).filter(([, item]) => item !== undefined)) };
}

export function runClaudeAdapter(raw, env = process.env) {
  const parsed = parseAdapterRequest(raw, CLAUDE_SUPPORTED_ROLES);
  if (!parsed.request) return parsed.response;
  const request = parsed.request;
  const options = request.adapterOptions || {};
  const binary = String(options.binary || env.CHALK_CLAUDE_BIN || 'claude');
  const model = options.model || env.CHALK_CLAUDE_MODEL || '';
  const secrets = Object.entries(options).filter(([key]) => /key|token|secret|password/i.test(key)).map(([, value]) => value);
  const processResult = spawnProvider(binary, claudeArgs(request, { ...options, model }), request, env);
  const envelope = parseClaudeEnvelope(processResult.stdout);
  if (!envelope) return providerFailure(request, 'Claude', processResult, secrets);

  const identity = {
    displayName: 'Claude Code',
    ...(model ? { model: String(model) } : {}),
    independenceKey: `claude:${model || 'default'}`,
  };
  const base = responseBase(request, identity, request.output.kind === 'json' ? 'adapter-decoded' : 'none');
  if (processResult.status !== 0 || processResult.stderr?.trim()) {
    base.diagnostics.push(adapterDiagnostic(
      'provider-diagnostic', redactProviderDiagnostic(processResult.stderr || `provider exited ${processResult.status}`, secrets),
      processResult.status !== 0, processResult.status === 0 ? 'warning' : 'error',
    ));
  }
  if (request.output.kind === 'json') {
    const structured = extractJsonObject(envelope.text);
    if (!structured) return { ...base, status: 'failed', text: envelope.text, usage: envelope.usage, diagnostics: [...base.diagnostics, adapterDiagnostic('provider-output', 'Claude did not return one JSON object')] };
    return { ...base, status: 'ok', structured, usage: envelope.usage };
  }
  if (request.output.kind === 'none') return { ...base, status: 'ok', usage: envelope.usage };
  return { ...base, status: 'ok', text: envelope.text, usage: envelope.usage };
}
