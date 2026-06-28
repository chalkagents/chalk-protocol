// Chalk Protocol — "did something break" before merge. After review, the change must be confirmed
// safe. The source of truth is the PR's REMOTE CI when it has any (the real signal a human trusts on
// the PR); when the project has no CI, fall back to a LOCAL verify so the gate still means something.
// Used by the merge gate. Zero deps beyond the spine.
import { gh as runGh } from './git.mjs';
import { verify } from './verify.mjs';
import { workdir } from './store.mjs';

// A bounded blocking sleep (no subprocess), injectable so tests don't actually wait.
const realSleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* fall through */ } };

// Remote CI verdict for the task's PR: 'pass' (all checks pass/skipping), 'fail' (any failing or
// cancelled), 'pending' (checks exist and some are still running, none failed), or 'none' (no PR, no
// gh, or no checks). `gh pr checks` exits nonzero while pending/failing but still prints the JSON, so
// we read stdout off the thrown error too.
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
  // A payload whose elements aren't check objects (no string `bucket`) isn't real checks data → none.
  if (!arr.every((c) => c && typeof c.bucket === 'string')) return 'none';
  if (arr.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'fail';
  if (arr.some((c) => c.bucket === 'pending')) return 'pending'; // still running — not broken, just not ready
  return 'pass';
}

// The merge-time safety check. Prefer remote CI; while CI is still PENDING, wait for it to settle
// (bounded poll — a racing PR isn't "broken"), then decide. Fall back to local verify only when the
// PR has no checks at all. Returns { ok, source: 'ci'|'local', detail }.
export function brokeCheck(store, task, { verifyFn = verify, classify = ciStatus, sleep = realSleep } = {}) {
  const gh = store.protocol().github || {};
  const everyMs = gh.ciPollIntervalMs ?? 5000;
  const maxAttempts = gh.ciPollAttempts ?? 24; // ~2 min of polling by default; set 0 to never wait
  let ci = classify(store, task);
  for (let i = 0; ci === 'pending' && i < maxAttempts; i++) { sleep(everyMs); ci = classify(store, task); }
  if (ci === 'pass') return { ok: true, source: 'ci', detail: 'remote CI green' };
  if (ci === 'fail') return { ok: false, source: 'ci', detail: 'remote CI checks are not green' };
  if (ci === 'pending') return { ok: false, source: 'ci', detail: 'remote CI still running — merge when checks complete' };
  const v = verifyFn(store, { cwd: workdir(store, task) });
  return { ok: !!v.green, source: 'local', detail: v.green ? 'local verify green' : 'local verify is not green' };
}
