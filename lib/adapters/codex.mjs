import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adapterDiagnostic, extractJsonObject, parseAdapterRequest, providerFailure, redactProviderDiagnostic,
  responseBase, spawnProvider,
} from './shared.mjs';
import { probeCli } from './probe.mjs';

export const CODEX_SUPPORTED_ROLES = Object.freeze(['executor', 'planner', 'reviewer']);
export const CODEX_ADAPTER_MANIFEST = Object.freeze({
  id: 'codex', displayName: 'Codex CLI', binary: 'codex', roles: CODEX_SUPPORTED_ROLES,
  capabilities: { access: ['read-only', 'workspace-write'], output: ['text', 'json'] },
  command: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL('../../bin/adapters/codex.mjs', import.meta.url)))}`,
  installCommand: 'npm install -g @openai/codex', authCommand: 'codex login',
  probe: (options) => probeCli({ id: 'codex', displayName: 'Codex CLI', binary: 'codex', versionArgs: ['--version'], authProbeArgs: ['login', 'status'], installCommand: 'npm install -g @openai/codex', authCommand: 'codex login' }, options),
});

const REVIEWER_SCHEMA = {
  type: 'object', required: ['verdict', 'findings', 'decisions'], additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'block'] },
    findings: { type: 'array', items: {
      type: 'object', required: ['severity', 'area', 'note'], additionalProperties: false,
      properties: {
        severity: { type: 'string', enum: ['high', 'med', 'low'] },
        area: { type: 'string', enum: ['correctness', 'test-adequacy', 'design-intent', 'regression'] },
        note: { type: 'string' },
      },
    } },
    decisions: { type: 'array', items: {
      type: 'object', required: ['choice', 'rationale', 'blastRadius', 'reversibility'], additionalProperties: false,
      properties: {
        choice: { type: 'string' }, rationale: { type: 'string' },
        blastRadius: { type: 'string', enum: ['low', 'med', 'high'] },
        reversibility: { type: 'string', enum: ['easy', 'hard'] },
      },
    } },
  },
};

export function codexArgs(request, options = {}) {
  const args = [
    '--ask-for-approval', 'never',
    'exec', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '--json',
    '--sandbox', request.access,
  ];
  if (options.model) args.push('--model', String(options.model));
  if (request.output.kind === 'json') {
    const dir = mkdtempSync(join(tmpdir(), 'chalk-codex-schema-'));
    const schema = join(dir, 'output.schema.json');
    writeFileSync(schema, `${JSON.stringify(REVIEWER_SCHEMA)}\n`);
    args.push('--output-schema', schema);
  }
  args.push(String(request.instructions || ''));
  return args;
}

export function parseCodexJsonl(raw) {
  let text = '';
  let usage = null;
  const diagnostics = [];
  let turns = 0;
  for (const line of String(raw || '').split('\n').map((item) => item.trim()).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { diagnostics.push(adapterDiagnostic('codex-event', 'Codex emitted a malformed JSONL event', false, 'warning')); continue; }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') text = String(event.item.text ?? event.item.content ?? text);
    if (event.type === 'turn.completed') {
      turns++;
      const rawUsage = event.usage || {};
      const finite = (item) => Number.isFinite(Number(item)) && Number(item) >= 0 ? Number(item) : undefined;
      usage = Object.fromEntries(Object.entries({
        inputTokens: finite(rawUsage.input_tokens), outputTokens: finite(rawUsage.output_tokens),
        cacheReadTokens: finite(rawUsage.cached_input_tokens), turns,
      }).filter(([, value]) => value !== undefined));
    }
    if (event.type === 'error' || event.type === 'turn.failed') diagnostics.push(adapterDiagnostic('codex-event', String(event.message || event.error?.message || event.type), true));
  }
  return { text, usage: usage && Object.keys(usage).length ? usage : null, diagnostics };
}

export function runCodexAdapter(raw, env = process.env) {
  const parsed = parseAdapterRequest(raw, CODEX_SUPPORTED_ROLES);
  if (!parsed.request) return parsed.response;
  const request = parsed.request;
  const options = request.adapterOptions || {};
  const binary = String(options.binary || 'codex');
  const processResult = spawnProvider(binary, codexArgs(request, options), request, env);
  if (processResult.error || processResult.status !== 0) return providerFailure(request, 'Codex', processResult);
  const decoded = parseCodexJsonl(processResult.stdout);
  const model = options.model ? String(options.model) : '';
  const identity = { displayName: 'Codex CLI', ...(model ? { model } : {}) };
  const base = responseBase(request, identity, request.output.kind === 'json' ? 'adapter-decoded' : 'none');
  base.diagnostics.push(...decoded.diagnostics);
  if (processResult.stderr?.trim()) base.diagnostics.push(adapterDiagnostic('provider-diagnostic', redactProviderDiagnostic(processResult.stderr), false, 'warning'));
  if (request.output.kind === 'json') {
    const structured = extractJsonObject(decoded.text);
    if (!structured) return { ...base, status: 'failed', text: decoded.text, ...(decoded.usage ? { usage: decoded.usage } : {}), diagnostics: [...base.diagnostics, adapterDiagnostic('provider-output', 'Codex did not return one structured result')] };
    return { ...base, status: 'ok', structured, ...(decoded.usage ? { usage: decoded.usage } : {}) };
  }
  return { ...base, status: 'ok', text: decoded.text, ...(decoded.usage ? { usage: decoded.usage } : {}) };
}
