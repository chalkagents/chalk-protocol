// Chalk Protocol — token-level cost capture (#99). The ledger used to record only THAT an agent was
// called (calls + wall-clock); this module harvests WHAT it consumed. `claude -p --output-format
// json` returns an envelope with usage (input/output/cache tokens), total_cost_usd and num_turns —
// one flag away. Policy: inject the flag into claude-shaped commands, unwrap the envelope BEFORE the
// existing parsers see the output, and opportunistically harvest any envelope an agent emits on its
// own. Accounting must never fail a run: everything here degrades to null (an ms-only record),
// nothing throws. Leaf module: no runtime dependencies.

// A command whose usage we can capture by injecting `--output-format json`: the claude CLI in print
// mode with no explicit --output-format of its own (an explicit one is the user's pinned choice —
// leave the command untouched and rely on the opportunistic unwrap instead). Deliberately
// conservative: a runner-prefixed command (`fvm claude …`) or a flag hidden in a quoted argument
// reads as not-claude/pinned and degrades to the legacy ms-only record, never to a broken stage.
export function isClaudeShaped(command) {
  const toks = String(command || '').trim().split(/\s+/).filter(Boolean);
  if ((toks[0] || '').split('/').pop() !== 'claude') return false;
  if (!toks.includes('-p') && !toks.includes('--print')) return false;
  return !toks.some((t) => t === '--output-format' || t.startsWith('--output-format='));
}

export function withJsonOutput(command) {
  return isClaudeShaped(command) ? `${String(command).trim()} --output-format json` : command;
}

// Parse a claude -p JSON envelope from raw stdout. Null unless the payload really is one (a
// type:'result' object with a string result) — arbitrary agent JSON (a bare reviewer verdict, a
// retro {lessons,issues} object) must never be mis-unwrapped. Tolerates a prepended banner or
// warning line: the envelope itself is single-line JSON, so when the whole-string parse fails we
// try the LAST line that looks like a JSON object before giving up.
export function parseEnvelope(raw) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const trimmed = String(raw ?? '').trim();
  let o = tryParse(trimmed);
  if (!o) {
    for (const line of trimmed.split('\n').reverse()) {
      if (line.trimStart().startsWith('{')) { o = tryParse(line.trim()); if (o) break; }
    }
  }
  if (!o || typeof o !== 'object' || o.type !== 'result' || typeof o.result !== 'string') return null;
  const u = o.usage || {};
  const int = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const opt = (x) => (Number.isFinite(Number(x)) ? Number(x) : undefined);
  return {
    result: o.result,
    tokens: { in: int(u.input_tokens), out: int(u.output_tokens), cacheRead: int(u.cache_read_input_tokens), cacheWrite: int(u.cache_creation_input_tokens) },
    costUsd: opt(o.total_cost_usd),
    turns: opt(o.num_turns),
  };
}

// Unwrap agent stdout: envelope (injected or self-emitted) → inner result text + usage fields for
// the ledger; anything else passes through untouched with usage null (an ms-only record).
export function unwrapAgentOutput(raw) {
  const env = parseEnvelope(raw);
  if (!env) return { text: String(raw ?? ''), usage: null };
  return { text: env.result, usage: { tokens: env.tokens, ...(env.costUsd !== undefined ? { costUsd: env.costUsd } : {}), ...(env.turns !== undefined ? { turns: env.turns } : {}) } };
}
