// Chalk Protocol — opencode (SST) adapter helpers. Pure, zero-dependency.
// Chalk pipes `chalk context` on STDIN, but opencode's `run` takes the prompt as an ARGV element;
// buildRunArgs bridges that without shell-quoting risk (prompt is always the verbatim last arg).
// extractJson robustly recovers the JSON object from opencode's chatty stdout for the contract
// roles — a balanced-brace scanner so log lines with stray braces can't fool a greedy regex.

// Build the argv for `opencode run`. Flags first (model, then attach), prompt always last & verbatim.
export function buildRunArgs(prompt, opts = {}) {
  const modelArgs = opts.model ? ['-m', opts.model] : [];
  const attachArgs = opts.attach ? ['--attach', opts.attach] : [];
  return ['run', '--auto', ...modelArgs, ...attachArgs, prompt];
}

// Extract & parse the first JSON object from possibly-chatty stdout. Returns the object, or null.
export function extractJson(stdout) {
  if (!stdout) return null;
  // Strip ```json / ``` code fences so fenced JSON is treated as bare text.
  const text = stdout.replace(/```(?:json)?/gi, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const candidate = matchBalanced(text, i);
    if (candidate === null) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // not valid JSON from this `{` — keep scanning for the next one.
    }
  }
  return null;
}

// From the `{` at `start`, return the balanced-brace substring (string-literal aware), or null.
function matchBalanced(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
