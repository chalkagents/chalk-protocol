// Chalk's provider-neutral agent execution seam. Workflow modules describe a role request and
// consume one normalized result; command execution and legacy output compatibility live here.
// Provider adapters can replace the raw-command transport without changing those workflows.
import { spawnSync } from 'node:child_process';
import { isClaudeShaped, parseEnvelope, unwrapAgentOutput, withJsonOutput } from './cost.mjs';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

function diagnostic(level, code, message, retryable = false) {
  return { level, code, message, retryable };
}

function normalizedUsage(legacy) {
  if (!legacy) return null;
  const tokens = legacy.tokens || {};
  const usage = {
    ...(tokens.in !== undefined ? { inputTokens: tokens.in } : {}),
    ...(tokens.out !== undefined ? { outputTokens: tokens.out } : {}),
    ...(tokens.cacheRead !== undefined ? { cacheReadTokens: tokens.cacheRead } : {}),
    ...(tokens.cacheWrite !== undefined ? { cacheWriteTokens: tokens.cacheWrite } : {}),
    ...(legacy.costUsd !== undefined ? { costUsd: legacy.costUsd } : {}),
    ...(legacy.turns !== undefined ? { turns: legacy.turns } : {}),
  };
  return Object.keys(usage).length ? usage : null;
}

// Store.logCost retains its v0 token field names. Keep that persistence concern outside the runner
// response so every adapter-facing result uses the Protocol v1 normalized usage vocabulary.
export function usageForLedger(usage) {
  if (!usage) return {};
  const tokenEntries = [
    ['in', usage.inputTokens],
    ['out', usage.outputTokens],
    ['cacheRead', usage.cacheReadTokens],
    ['cacheWrite', usage.cacheWriteTokens],
  ].filter(([, value]) => value !== undefined);
  return {
    ...(tokenEntries.length ? { tokens: Object.fromEntries(tokenEntries) } : {}),
    ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
    ...(usage.turns !== undefined ? { turns: usage.turns } : {}),
  };
}

function result(status, { text = '', structured = null, usage = null, identity = null, diagnostics = [] } = {}) {
  return { status, text, structured, usage, identity, diagnostics };
}

const COST_STAGE = {
  executor: 'work',
  planner: 'plan',
  reviewer: 'review',
  discovery: 'discovery',
  feedback: 'feedback',
  retro: 'retro',
  handoff: 'handoff',
  'pr-narrative': 'pr-narrative',
  'regression-author': 'regression-author',
};

function recordCost(role, request, startedAt, usage) {
  const cost = request.cost;
  if (!cost?.store || typeof cost.store.logCost !== 'function') return;
  cost.store.logCost({
    taskId: cost.taskId,
    stage: cost.stage || COST_STAGE[role] || role,
    agent: cost.agent || role,
    ms: Date.now() - startedAt,
    ...usageForLedger(usage),
  });
}

function failureFromProcess(processResult) {
  if (processResult.error?.code === 'ETIMEDOUT') {
    return { status: 'timeout', diagnostic: diagnostic('error', 'timeout', 'agent command exceeded its deadline', true) };
  }
  if (processResult.status === 127) {
    return { status: 'failed', diagnostic: diagnostic('error', 'command-not-found', 'agent command could not be found', false) };
  }
  if (processResult.error) {
    return { status: 'failed', diagnostic: diagnostic('error', 'transport-error', String(processResult.error.message || processResult.error), true) };
  }
  if (processResult.signal) {
    return { status: 'failed', diagnostic: diagnostic('error', 'signal', `agent command terminated by ${processResult.signal}`, true) };
  }
  if (processResult.status !== 0) {
    return { status: 'failed', diagnostic: diagnostic('error', 'nonzero-exit', `agent command exited with status ${processResult.status}`, true) };
  }
  return { status: 'ok', diagnostic: null };
}

function structuredOutput(text, output, status, diagnostics) {
  if (output?.kind !== 'json' || status !== 'ok') return { status, structured: null };
  try { return { status, structured: JSON.parse(text) }; }
  catch {
    diagnostics.push(diagnostic('error', 'malformed-structured-output', 'agent output was not valid JSON', false));
    return { status: 'failed', structured: null };
  }
}

// Execute an existing command-string configuration through the common role seam. `stream` defaults
// on for the executor, preserving live terminal output; captured roles retain their plain text.
// Legacy Claude-envelope handling remains centralized here solely for #99 compatibility while real
// provider adapters are introduced. Workflow modules never inspect a provider or binary name.
export function runAgent(role, request = {}) {
  const startedAt = Date.now();
  const profile = request.profile || null;
  const identity = profile?.identity || null;
  const command = String(request.command || profile?.command || '').trim();
  if (!command) return result('failed', { identity, diagnostics: [diagnostic('error', 'missing-command', `no command configured for ${role}`, false)] });

  const stream = request.stream ?? role === 'executor';
  const capture = !stream || isClaudeShaped(command);
  const captureStderr = request.stderr === 'capture';
  const invokedCommand = capture ? withJsonOutput(command) : command;
  const processResult = spawnSync(invokedCommand, {
    cwd: request.cwd,
    input: request.input ?? '',
    encoding: capture ? 'utf8' : undefined,
    stdio: ['pipe', capture ? 'pipe' : 'inherit', captureStderr ? 'pipe' : (request.stderr === 'ignore' ? 'ignore' : 'inherit')],
    timeout: request.timeout ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: request.maxBuffer ?? DEFAULT_MAX_BUFFER,
    env: request.env,
    shell: true,
  });

  const stdout = capture ? String(processResult.stdout || '') : '';
  const stderr = captureStderr ? String(processResult.stderr || '') : '';
  const failureOutput = request.failureOutput || 'stdout';
  const raw = processResult.status === 0
    ? stdout
    : failureOutput === 'combined'
      ? `${stdout}${stderr}`
      : failureOutput === 'stdout-first'
        ? (stdout || stderr)
        : stdout;
  const unwrapped = unwrapAgentOutput(raw);
  const diagnostics = [];
  const processFailure = failureFromProcess(processResult);
  if (processFailure.diagnostic) diagnostics.push(processFailure.diagnostic);
  if (stderr.trim()) diagnostics.push(diagnostic(processFailure.status === 'ok' ? 'warning' : 'error', 'stderr', stderr.trim().slice(-600), processFailure.status !== 'ok'));

  // Cost capture has always treated malformed provider envelopes as ordinary text. Preserve that
  // non-fatal behavior, but make the condition observable to callers through a warning.
  if (/['"]type['"]\s*:\s*['"]result['"]/.test(raw) && !parseEnvelope(raw)) {
    diagnostics.push(diagnostic('warning', 'malformed-envelope', 'agent output resembled an incomplete result envelope and was retained as text', false));
  }

  const parsed = structuredOutput(unwrapped.text, request.output, processFailure.status, diagnostics);
  const text = String(unwrapped.text || '');
  if (stream && capture && text.trim()) process.stdout.write(`${text.trimEnd()}\n`);
  const normalized = result(parsed.status, {
    text,
    structured: parsed.structured,
    usage: normalizedUsage(unwrapped.usage),
    identity,
    diagnostics,
  });
  recordCost(role, request, startedAt, normalized.usage);
  return normalized;
}
