// Robust JSON recovery from arbitrary LLM stdout. BYO agents (reviewer, retro, feedback, discovery) wrap
// their JSON in reasoning/prose, and a greedy /\{[\s\S]*\}/ match spans from the FIRST stray brace to the
// LAST — so a note like "the guard { } is off" before the verdict makes the whole span unparseable (this
// blocked a real adversarial review). Instead, scan for BALANCED top-level {...} objects, ignoring braces
// inside strings, and recover the operative one. Leaf module: zero deps, imports nothing local.

// All balanced top-level `{...}` substrings in `raw`, in order. Brace characters inside JSON strings are
// not treated as delimiters (so `{"x":"a } b"}` stays a single object). Unbalanced/ stray braces are ignored.
export function jsonObjects(raw) {
  const s = String(raw || '');
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}') { if (depth > 0 && --depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

// Parse the LAST balanced JSON object in `raw` that both parses and satisfies `ok`. LLMs emit the operative
// JSON last (after their reasoning), so searching end-first recovers the intended object. Returns it, or null.
export function parseLastJson(raw, ok = () => true) {
  const cands = jsonObjects(raw);
  for (let i = cands.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(cands[i]);
      if (o && typeof o === 'object' && ok(o)) return o;
    } catch { /* not valid JSON — try the next candidate */ }
  }
  return null;
}
