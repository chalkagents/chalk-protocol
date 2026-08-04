---
generator: chalk-protocol
id: "task-056bac99"
name: "ci: add a windows-latest lane and fix what breaks"
overview: "The pull-request and dev/main test workflow runs the complete zero-dependency node --test suite on both ubuntu-latest and windows-latest using the supported Node version; concurrency cancellation behavior remains unchanged."
created: "2026-07-06T10:05:49.982Z"
todos:
  - id: "task-056bac99-c1"
    content: "The pull-request and dev/main test workflow runs the complete zero-dependency node --test suite on both ubuntu-latest and windows-latest using the supported Node version; concurrency cancellation behavior remains unchanged."
    status: pending
  - id: "task-056bac99-c2"
    content: "Chalk's executable discovery, subprocess execution, git workflows, temporary paths, and path normalization pass on Windows without relying on POSIX-only command -v, /bin/sh, executable bits, or shell quoting."
    status: pending
  - id: "task-056bac99-c3"
    content: "Any test that cannot meaningfully execute on Windows is skipped only through an explicit process.platform guard whose reason cites a tracked follow-up issue; the rest of the suite remains enabled."
    status: pending
  - id: "task-056bac99-c4"
    content: "A locked test protects the Windows CI matrix, full-suite command, supported Node version, and absence of untracked unconditional Windows exclusions; user-facing documentation states the verified platform support level."
    status: pending
---

# ci: add a windows-latest lane and fix what breaks

> state: **in-progress** · phase: discovery

## Objective

- The pull-request and dev/main test workflow runs the complete zero-dependency node --test suite on both ubuntu-latest and windows-latest using the supported Node version; concurrency cancellation behavior remains unchanged.
- Chalk's executable discovery, subprocess execution, git workflows, temporary paths, and path normalization pass on Windows without relying on POSIX-only command -v, /bin/sh, executable bits, or shell quoting.
- Any test that cannot meaningfully execute on Windows is skipped only through an explicit process.platform guard whose reason cites a tracked follow-up issue; the rest of the suite remains enabled.
- A locked test protects the Windows CI matrix, full-suite command, supported Node version, and absence of untracked unconditional Windows exclusions; user-facing documentation states the verified platform support level.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
