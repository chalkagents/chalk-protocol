// Chalk's provider-neutral agent execution seam. Workflow modules describe a role request and
// consume one normalized result. Raw compatibility and Protocol v1 execution sit behind imported
// adapters, so workflows and this module do not know provider commands or flags.
import { checkRoleCapabilities, decodeStructuredRole, roleContract, validateStructuredRole } from './agent-contracts.mjs';
import { snapshotChanges, workspaceSnapshot } from './workspace-snapshot.mjs';
import { roleInstructions } from './role-instructions.mjs';
import { invokeRawCommand } from './raw-command-adapter.mjs';
import { invokeProtocolAdapter } from './agent-adapter-transport.mjs';
import { refuseReadOnlyMutation } from './read-only-enforcement.mjs';

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

function result(status, { text = '', structured = null, usage = null, identity = null, capabilities = null, diagnostics = [] } = {}) {
  return { status, text, structured, usage, identity, capabilities, diagnostics };
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
  if (processResult.status === 127 || processResult.error?.code === 'ENOENT') {
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

// Execute a role through either the versioned adapter interface or the raw-command compatibility
// interface. Provider selection and behavior remain opaque to this core module.
export function runAgent(role, request = {}) {
  const startedAt = Date.now();
  const profile = request.profile || null;
  const identity = profile?.identity || null;
  const contract = roleContract(role);
  const capability = checkRoleCapabilities(role, profile || { name: 'inline' });
  if (!capability.ok) return result('failed', {
    identity, capabilities: capability.reported,
    diagnostics: capability.problems.map((message) => diagnostic('error', 'unsupported-capability', message, false)),
  });
  const command = String(request.command || profile?.command || '').trim();
  if (!command) return result('failed', { identity, capabilities: capability.reported, diagnostics: [diagnostic('error', 'missing-command', `no command configured for ${role}`, false)] });

  const stream = request.stream ?? role === 'executor';
  const instructions = request.instructions ?? roleInstructions(role);
  const context = request.context !== undefined ? request.context : request.input;
  const workspaceRoot = request.cwd || process.cwd();
  const before = contract?.access === 'read-only' ? workspaceSnapshot(workspaceRoot) : null;
  const isProtocol = profile?.adapter && profile.adapter !== 'raw-command';
  let status, structured, text, usage, resolvedIdentity, capabilities, diagnostics, capture;
  if (isProtocol) {
    const adapted = invokeProtocolAdapter(role, {
      profile, instructions, context, contract, cwd: request.cwd,
      timeoutMs: request.timeout ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: request.maxBuffer ?? DEFAULT_MAX_BUFFER,
      env: request.env,
    });
    ({ status, structured, text, usage, identity: resolvedIdentity, capabilities, diagnostics } = adapted);
    capture = true;
    if (contract.output.kind === 'json' && structured !== null) {
      const invalid = validateStructuredRole(role, structured);
      if (invalid) { diagnostics.push(invalid); status = 'failed'; structured = null; }
    }
  } else {
    // Raw-command is the compatibility transport: its stdin is the exact pre-v1 stage prompt.
    // Canonical instructions stay a separate Protocol v1 field and must never prefix legacy input.
    const raw = invokeRawCommand(command, context ?? '', {
      ...request, timeout: request.timeout ?? DEFAULT_TIMEOUT_MS, maxBuffer: request.maxBuffer ?? DEFAULT_MAX_BUFFER,
    }, stream);
    capture = raw.capture;
    const processFailure = failureFromProcess(raw.processResult);
    diagnostics = processFailure.diagnostic ? [processFailure.diagnostic] : [];
    if (raw.stderr.trim()) diagnostics.push(diagnostic(processFailure.status === 'ok' ? 'warning' : 'error', 'stderr', raw.stderr.trim().slice(-600), processFailure.status !== 'ok'));
    if (raw.malformedEnvelope) diagnostics.push(diagnostic('warning', 'malformed-envelope', 'agent output resembled an incomplete result envelope and was retained as text', false));
    status = processFailure.status;
    text = String(raw.unwrapped.text || '');
    usage = normalizedUsage(raw.unwrapped.usage);
    resolvedIdentity = identity;
    capabilities = capability.reported;
    structured = null;
    if (contract.output.kind === 'json') {
      const decoded = decodeStructuredRole(role, text);
      structured = decoded.structured;
      if (decoded.diagnostic) { diagnostics.push(decoded.diagnostic); status = 'failed'; }
    }
  }
  const changed = before ? snapshotChanges(before, workspaceSnapshot(workspaceRoot)) : [];
  let normalized = result(status, {
    text,
    structured,
    usage,
    identity: resolvedIdentity,
    capabilities,
    diagnostics,
  });
  normalized = refuseReadOnlyMutation(role, normalized, changed);
  if (stream && capture && normalized.text.trim()) process.stdout.write(`${normalized.text.trimEnd()}\n`);
  recordCost(role, request, startedAt, normalized.usage);
  return normalized;
}
