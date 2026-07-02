---
generator: chalk-protocol
id: "task-9bf2a03e"
name: "feat: broke-check — remote CI gate with local fallback"
overview: "lib/brokecheck.mjs exports ciStatus(store, task) and brokeCheck(store, task, {verifyFn})"
created: "2026-06-28T17:14:58.599Z"
todos:
  - id: "task-9bf2a03e-c1"
    content: "lib/brokecheck.mjs exports ciStatus(store, task) and brokeCheck(store, task, {verifyFn})"
    status: done
  - id: "task-9bf2a03e-c2"
    content: "ciStatus returns 'pass' when all gh pr checks buckets are pass/skipping, 'fail' when any are fail/pending/cancel, and 'none' when there is no PR, no gh, or no checks (empty array)"
    status: done
  - id: "task-9bf2a03e-c3"
    content: "ciStatus tolerates gh exiting nonzero while still printing the JSON (failing/pending checks) by parsing its stdout"
    status: done
  - id: "task-9bf2a03e-c4"
    content: "brokeCheck uses CI when present (source:'ci'); when CI is 'none' it falls back to local verify (source:'local'); ok reflects the chosen source"
    status: done
---

# feat: broke-check — remote CI gate with local fallback

> state: **done** · phase: discovery

## Objective

- lib/brokecheck.mjs exports ciStatus(store, task) and brokeCheck(store, task, {verifyFn})
- ciStatus returns 'pass' when all gh pr checks buckets are pass/skipping, 'fail' when any are fail/pending/cancel, and 'none' when there is no PR, no gh, or no checks (empty array)
- ciStatus tolerates gh exiting nonzero while still printing the JSON (failing/pending checks) by parsing its stdout
- brokeCheck uses CI when present (source:'ci'); when CI is 'none' it falls back to local verify (source:'local'); ok reflects the chosen source

## Locked tests (read-only — P6)

- `test/brokecheck.test.mjs`

## Reviews

- **pass** · 2026-06-28T17:37 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
