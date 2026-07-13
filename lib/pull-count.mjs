// Chalk Protocol — the ONE contract between `chalk issue pull` (emitter) and the standing loop
// (parser). The loop learns how many issues a round imported by parsing pull's stdout; if that
// count reads 0 when it shouldn't, the loop declares a false steady state and stops importing work.
// Emitter and parser used to hold TWO copies of the "pulled N new issue(s)" literal — a reword on
// one side would silently zero the other. Both now import this module, so the phrasing and the regex
// that reads it live and move together. Zero dependencies.

// The count-bearing clause of the pull success line. `count` may be a plain number or an
// already-colored string (the CLI bolds it) — the parser strips ANSI before matching either way.
export const pulledIssuesLine = (count) => `pulled ${count} new issue(s)`;

// Matches the clause above after ANSI is stripped. Anchored on "pulled … new issue" so an unrelated
// line mentioning a number can't spoof the count.
export const PULLED_ISSUES_RE = /pulled\s+(\d+)\s+new issue/i;

// Read the imported-issue count out of pull's (possibly colored, possibly multi-line) output.
// Returns 0 when the line is absent — the caller treats that as "nothing pulled".
export function parsePulledIssues(text) {
  const clean = String(text ?? '').replace(/\x1B\[[0-9;]*m/g, '');
  const m = clean.match(PULLED_ISSUES_RE);
  return m ? Number(m[1]) : 0;
}
