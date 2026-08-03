// Public offline fixture convention for Agent Adapter Protocol v1 implementations.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adapterDiagnostic, ADAPTER_PROTOCOL_VERSION } from './shared.mjs';

const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no-op */ } };

function base(request, adapter, capabilities = { accessEnforced: request.access, structuredOutput: request.output?.kind === 'json' ? 'adapter-decoded' : 'none' }) {
  return {
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    requestId: String(request.requestId),
    status: 'ok',
    identity: { displayName: `${adapter} conformance fixture`, model: 'offline-fixture', independenceKey: `${adapter}:offline-fixture` },
    capabilities,
    diagnostics: [],
  };
}

export function conformanceFixtureOutcome(raw, adapter = 'adapter') {
  let request;
  try { request = JSON.parse(String(raw || '')); } catch { return { handled: false }; }
  const fixture = request?.adapterOptions?.conformanceFixture;
  if (!fixture) return { handled: false };
  const ok = base(request, adapter);
  const text = { ...ok, text: fixture === 'multiline' ? request.context : 'offline conformance text' };
  const outcomes = {
    multiline: { response: text },
    text: { response: text },
    structured: { response: { ...ok, structured: { verdict: 'pass', findings: [], decisions: [] } } },
    noisy: { rawOutput: `provider banner\n${JSON.stringify(text)}\n` },
    malformed: { rawOutput: '{"protocolVersion":"chalk-agent-adapter/1",' },
    nonzero: { response: text, exitCode: 7 },
    timeout: { response: text, delayMs: 250 },
    'missing-usage': { response: text },
    usage: { response: { ...text, usage: { inputTokens: 13, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1, costUsd: 0.02, turns: 2 } } },
    identity: { response: text },
    diagnostics: { response: { ...text, diagnostics: [adapterDiagnostic('offline-diagnostic', 'offline fixture diagnostic', false, 'warning')] } },
    'read-only': { response: { ...text, capabilities: { accessEnforced: 'read-only', structuredOutput: 'none' } } },
    'workspace-write': { response: { ...text, capabilities: { accessEnforced: 'workspace-write', structuredOutput: 'none' } } },
    unsupported: { response: { ...ok, status: 'unsupported', diagnostics: [adapterDiagnostic('unsupported-capability', 'fixture refuses the requested capability')] } },
    mutation: { response: text, mutate: true },
  };
  const outcome = outcomes[fixture] || { response: { ...ok, status: 'unsupported', diagnostics: [adapterDiagnostic('unknown-conformance-fixture', String(fixture))] } };
  return { handled: true, ...outcome, request };
}

export function emitConformanceFixture(outcome) {
  if (!outcome?.handled) return false;
  if (outcome.mutate) writeFileSync(join(outcome.request.workingDirectory, 'conformance-mutation.txt'), 'mutation fixture\n');
  if (outcome.delayMs) sleep(outcome.delayMs);
  process.stdout.write(outcome.rawOutput ?? `${JSON.stringify(outcome.response)}\n`);
  process.exitCode = outcome.exitCode ?? 0;
  return true;
}
