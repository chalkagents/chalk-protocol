#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const VERSION = 'chalk-agent-adapter/1';

function diagnostic(code, message, retryable = false) {
  return { level: 'error', code, message, retryable };
}

function emit(response, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exitCode = exitCode;
}

let request;
try {
  request = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  emit({
    protocolVersion: VERSION,
    requestId: 'unknown',
    status: 'failed',
    diagnostics: [diagnostic('invalid-request', 'stdin was not one JSON request object')],
  }, 1);
}

if (request && request.protocolVersion !== VERSION) {
  emit({
    protocolVersion: VERSION,
    requestId: String(request.requestId || 'unknown'),
    status: 'unsupported',
    diagnostics: [diagnostic('unsupported-version', `expected ${VERSION}`)],
  });
} else if (request) {
  const base = {
    protocolVersion: VERSION,
    requestId: String(request.requestId),
    identity: {
      displayName: 'Chalk Protocol v1 fake adapter',
      model: 'fake-model',
      independenceKey: 'fake-adapter-family',
    },
    capabilities: {
      accessEnforced: request.access,
      structuredOutput: request.output?.kind === 'json' ? 'adapter-decoded' : 'none',
    },
    diagnostics: [],
  };

  if (request.adapterOptions?.fixture === 'failure') {
    emit({
      ...base,
      status: 'failed',
      text: 'partial fake provider output',
      diagnostics: [diagnostic('fake-provider-exit', 'requested failure fixture', true)],
    });
  } else if (request.output?.kind === 'text') {
    emit({
      ...base,
      status: 'ok',
      text: `fake ${request.role} response: ${request.context}`,
      usage: { inputTokens: 12, outputTokens: 5, turns: 1 },
    });
  } else if (request.output?.kind === 'json') {
    const structuredBySchema = {
      'chalk/reviewer-result/1': { verdict: 'pass', findings: [], decisions: [] },
      'chalk/discovery-proposal/1': { tasks: [] },
      'chalk/feedback-result/1': { issues: [] },
      'chalk/retro-result/1': { lessons: [], issues: [] },
    };
    const structured = structuredBySchema[request.output.schema];
    if (!structured) {
      emit({
        ...base,
        status: 'unsupported',
        diagnostics: [diagnostic('unsupported-schema', String(request.output.schema || '(missing)'))],
      });
    } else {
      emit({ ...base, status: 'ok', structured, usage: { inputTokens: 20, outputTokens: 8 } });
    }
  } else if (request.output?.kind === 'none') {
    emit({ ...base, status: 'ok' });
  } else {
    emit({
      ...base,
      status: 'unsupported',
      diagnostics: [diagnostic('unsupported-output', String(request.output?.kind || '(missing)'))],
    });
  }
}
