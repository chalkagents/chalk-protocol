// Pre-v1 compatibility only. New Claude profiles use bin/adapters/claude.mjs and Protocol v1.
export function isClaudeShaped(command) {
  const toks = String(command || '').trim().split(/\s+/).filter(Boolean);
  if ((toks[0] || '').split('/').pop() !== 'claude') return false;
  if (!toks.includes('-p') && !toks.includes('--print')) return false;
  return !toks.some((t) => t === '--output-format' || t.startsWith('--output-format='));
}

export function withJsonOutput(command) {
  return isClaudeShaped(command) ? `${String(command).trim()} --output-format json` : command;
}

export function parseEnvelope(raw) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const trimmed = String(raw ?? '').trim();
  let value = tryParse(trimmed);
  if (!value) {
    for (const line of trimmed.split('\n').reverse()) {
      if (line.trimStart().startsWith('{')) { value = tryParse(line.trim()); if (value) break; }
    }
  }
  if (!value || typeof value !== 'object' || value.type !== 'result' || typeof value.result !== 'string') return null;
  const usage = value.usage || {};
  const int = (item) => Number.isFinite(Number(item)) ? Number(item) : 0;
  const opt = (item) => Number.isFinite(Number(item)) ? Number(item) : undefined;
  return {
    result: value.result,
    tokens: { in: int(usage.input_tokens), out: int(usage.output_tokens), cacheRead: int(usage.cache_read_input_tokens), cacheWrite: int(usage.cache_creation_input_tokens) },
    costUsd: opt(value.total_cost_usd),
    turns: opt(value.num_turns),
  };
}

export function unwrapAgentOutput(raw) {
  const envelope = parseEnvelope(raw);
  if (!envelope) return { text: String(raw ?? ''), usage: null };
  return {
    text: envelope.result,
    usage: {
      tokens: envelope.tokens,
      ...(envelope.costUsd !== undefined ? { costUsd: envelope.costUsd } : {}),
      ...(envelope.turns !== undefined ? { turns: envelope.turns } : {}),
    },
  };
}
