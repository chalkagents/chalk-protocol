---
generator: chalk-protocol
id: "task-3cbf419d"
name: "feat: complete verification evidence handoff to review and PR descriptions"
overview: "Extend existing verification receipts and automatic review evidence: completed commands have exit status, timestamps and current source identity even if prior status was running. Review and PR descriptions consume the same recorded evidence and distinguish supplied evidence from independently rerun checks."
created: "2026-09-10T01:40:43.434Z"
todos:
  - id: "task-3cbf419d-c1"
    content: "Extend existing verification receipts and automatic review evidence: completed commands have exit status, timestamps and current source identity even if prior status was running. Review and PR descriptions consume the same recorded evidence and distinguish supplied evidence from independently rerun checks."
    status: done
  - id: "task-3cbf419d-c2"
    content: "Reuse the existing bounded, local, source-aware evidence summary in deterministic PR descriptions. Include per-command start and finish times and elapsed duration. Clearly distinguish passed commands from an incomplete overall receipt and supplied evidence from independent execution; never upgrade running, failed, stale, malformed or unknown records into successful gate evidence. Preserve all existing completion and integrity gates; safe cross-command reuse remains a separately scoped follow-up because complete external toolchain identity is not established."
    status: done
  - id: "task-3cbf419d-c3"
    content: "New PR bodies must not claim verification is green without evidence. Render a bounded projection of the shared summary, retaining command labels, outcomes, timestamps and source fingerprint while omitting command strings, local paths, raw logs and environment values. Evidence collection must not execute the toolchain or alter task completion."
    status: done
---

# feat: complete verification evidence handoff to review and PR descriptions

> state: **done** · phase: discovery

## Objective

- Extend existing verification receipts and automatic review evidence: completed commands have exit status, timestamps and current source identity even if prior status was running. Review and PR descriptions consume the same recorded evidence and distinguish supplied evidence from independently rerun checks.
- Reuse the existing bounded, local, source-aware evidence summary in deterministic PR descriptions. Include per-command start and finish times and elapsed duration. Clearly distinguish passed commands from an incomplete overall receipt and supplied evidence from independent execution; never upgrade running, failed, stale, malformed or unknown records into successful gate evidence. Preserve all existing completion and integrity gates; safe cross-command reuse remains a separately scoped follow-up because complete external toolchain identity is not established.
- New PR bodies must not claim verification is green without evidence. Render a bounded projection of the shared summary, retaining command labels, outcomes, timestamps and source fingerprint while omitting command strings, local paths, raw logs and environment values. Evidence collection must not execute the toolchain or alter task completion.

## Locked tests (read-only — P6)

- `test/verification-handoff.test.mjs`

## Reviews

- **block** · 2026-09-10T06:07 · adversary
- **stale** · 2026-09-10T06:10 · amend-spec
- **pass** · 2026-09-10T06:41 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
