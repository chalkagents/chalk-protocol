---
generator: chalk-protocol
id: "task-2ece6525"
name: "feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)"
overview: "Concurrent chalk processes mutating tasks.json via upsertTask do not lose updates: the read-modify-write runs under a cross-process advisory lock and RE-READS inside it, so N concurrent adds of distinct tasks all survive (no last-writer-wins clobber)"
created: "2026-07-08T15:46:44.348Z"
todos:
  - id: "task-2ece6525-c1"
    content: "Concurrent chalk processes mutating tasks.json via upsertTask do not lose updates: the read-modify-write runs under a cross-process advisory lock and RE-READS inside it, so N concurrent adds of distinct tasks all survive (no last-writer-wins clobber)"
    status: done
  - id: "task-2ece6525-c2"
    content: "Spine JSON writes are atomic (temp file + rename): a concurrent reader always sees a complete valid file, and no .tmp residue is left after a successful write"
    status: done
  - id: "task-2ece6525-c3"
    content: "The lock self-heals and stays out of the repo: a crashed holder's stale lock (older than the threshold) is stolen so a dead process cannot wedge the spine; the .lock and atomic-write temp files are gitignored"
    status: done
---

# feat: spine write safety — atomic tasks.json writes + append-only event log so concurrent chalk processes don't clobber the spine (#110 slice 2)

> state: **done** · phase: discovery

## Objective

- Concurrent chalk processes mutating tasks.json via upsertTask do not lose updates: the read-modify-write runs under a cross-process advisory lock and RE-READS inside it, so N concurrent adds of distinct tasks all survive (no last-writer-wins clobber)
- Spine JSON writes are atomic (temp file + rename): a concurrent reader always sees a complete valid file, and no .tmp residue is left after a successful write
- The lock self-heals and stays out of the repo: a crashed holder's stale lock (older than the threshold) is stolen so a dead process cannot wedge the spine; the .lock and atomic-write temp files are gitignored

## Locked tests (read-only — P6)

- `test/spine-concurrent-writes.test.mjs`

## Reviews

- **block** · 2026-07-08T16:10 · adversary
- **block** · 2026-07-08T16:16 · adversary
- **pass** · 2026-07-08T16:20 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
