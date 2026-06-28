// Chalk Protocol — "did something break" before merge. After review, the change must be confirmed
// safe. The source of truth is the PR's REMOTE CI when it has any (the real signal a human trusts on
// the PR); when the project has no CI, fall back to a LOCAL verify so the gate still means something.
// Used by the merge gate. Zero deps beyond the spine.
import { gh as runGh } from './git.mjs';
import { verify } from './verify.mjs';
import { workdir } from './store.mjs';

// Remote CI verdict for the task's PR: 'pass' (all checks pass/skipping), 'fail' (any failing,
// pending, or cancelled — not known-safe yet), or 'none' (no PR, no gh, or no checks configured).
// `gh pr checks` exits nonzero when checks are failing/pending but still prints the JSON, so we read
// stdout off the thrown error too.
export function ciStatus(store, task) {
  const num = task.pr?.number;
  const ghCmd = store.protocol().github?.command;
  if (!num || !ghCmd) return 'none';
  let raw;
  try { raw = runGh(workdir(store, task), ghCmd, `pr checks ${num} --json bucket`); }
  catch (e) { raw = `${e.stdout || ''}`.trim(); if (!raw) return 'none'; }
  let arr;
  try { arr = JSON.parse(raw); } catch { return 'none'; }
  if (!Array.isArray(arr) || !arr.length) return 'none';
  // Defensive: a payload whose elements aren't check objects (no string `bucket`) isn't real checks
  // data (e.g. a stub or an unexpected gh response) — treat as no CI rather than a spurious fail.
  if (!arr.every((c) => c && typeof c.bucket === 'string')) return 'none';
  return arr.every((c) => c.bucket === 'pass' || c.bucket === 'skipping') ? 'pass' : 'fail';
}

// The merge-time safety check. Prefer remote CI; fall back to local verify only when the PR has no
// checks. `verifyFn` is injectable for testing. Returns { ok, source: 'ci'|'local', detail }.
export function brokeCheck(store, task, { verifyFn = verify } = {}) {
  const ci = ciStatus(store, task);
  if (ci === 'pass') return { ok: true, source: 'ci', detail: 'remote CI green' };
  if (ci === 'fail') return { ok: false, source: 'ci', detail: 'remote CI checks are not green' };
  const v = verifyFn(store, { cwd: workdir(store, task) });
  return { ok: !!v.green, source: 'local', detail: v.green ? 'local verify green' : 'local verify is not green' };
}
