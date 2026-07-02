---
generator: chalk-protocol
id: "task-389663ac"
name: "feat: gate hardening — probe-error disambiguation, reviewer diff truncation marker + file stat, silent-failure warnings, mutation CLI wiring test"
overview: "runBreakit reports probe-command failures (ENOENT/127/timeout/kill) as inconclusive — never as fails-on-base rigor; vacuous detection unchanged"
created: "2026-07-02T05:00:52.887Z"
todos:
  - id: "task-389663ac-c1"
    content: "runBreakit reports probe-command failures (ENOENT/127/timeout/kill) as inconclusive — never as fails-on-base rigor; vacuous detection unchanged"
    status: done
  - id: "task-389663ac-c2"
    content: "runMutation reports an unrunnable mutation tool as inconclusive instead of silently clean; real survivors still flagged"
    status: done
  - id: "task-389663ac-c3"
    content: "chalk work prints a loud INCONCLUSIVE warning for unrunnable probes and still exits 2 on real survivors (M2 CLI wiring pinned)"
    status: done
  - id: "task-389663ac-c4"
    content: "review prompt diff: truncation is explicitly marked and the git diff --stat changed-file list is always appended (formatDiffForReview exported)"
    status: done
  - id: "task-389663ac-c5"
    content: "silent-failure sweep: handoff narrator failure warns and falls back to template-only; cost-ledger write failure warns once per process; merge broke-check local-fallback is labeled"
    status: done
---

# feat: gate hardening — probe-error disambiguation, reviewer diff truncation marker + file stat, silent-failure warnings, mutation CLI wiring test

> state: **done** · phase: discovery

## Objective

- runBreakit reports probe-command failures (ENOENT/127/timeout/kill) as inconclusive — never as fails-on-base rigor; vacuous detection unchanged
- runMutation reports an unrunnable mutation tool as inconclusive instead of silently clean; real survivors still flagged
- chalk work prints a loud INCONCLUSIVE warning for unrunnable probes and still exits 2 on real survivors (M2 CLI wiring pinned)
- review prompt diff: truncation is explicitly marked and the git diff --stat changed-file list is always appended (formatDiffForReview exported)
- silent-failure sweep: handoff narrator failure warns and falls back to template-only; cost-ledger write failure warns once per process; merge broke-check local-fallback is labeled

## Locked tests (read-only — P6)

- `test/gate-hardening.test.mjs`

## Reviews

- **block** · 2026-07-02T05:20 · adversary
- **pass** · 2026-07-02T05:26 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
