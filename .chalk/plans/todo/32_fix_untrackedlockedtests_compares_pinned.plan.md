---
generator: chalk-protocol
id: "task-ae4422c1"
name: "fix: untrackedLockedTests compares pinned paths verbatim against git ls-files — a './'-prefixed, backslashed, or case-differing pin false-blocks done/pr"
overview: "Normalize both the pinned path and each `ls-files` entry before comparison (strip a leading `./`, unify path separators) so equivalent forms match"
created: "2026-07-07T11:12:53.786Z"
todos:
  - id: "task-ae4422c1-c1"
    content: "Normalize both the pinned path and each `ls-files` entry before comparison (strip a leading `./`, unify path separators) so equivalent forms match"
    status: pending
  - id: "task-ae4422c1-c2"
    content: "Handle case-insensitive filesystems so a case-only difference does not false-block (or document the platform boundary)"
    status: pending
  - id: "task-ae4422c1-c3"
    content: "Add a locked test: a tracked file pinned as `./<path>` (and a backslash/case variant) is NOT reported untracked and `chalk done` proceeds"
    status: pending
  - id: "task-ae4422c1-c4"
    content: "Keep the genuinely-untracked case still blocking (no regression to the #107 vacuous-green guard)"
    status: pending
---

# fix: untrackedLockedTests compares pinned paths verbatim against git ls-files — a './'-prefixed, backslashed, or case-differing pin false-blocks done/pr

> state: **specd** · phase: discovery

## Objective

- Normalize both the pinned path and each `ls-files` entry before comparison (strip a leading `./`, unify path separators) so equivalent forms match
- Handle case-insensitive filesystems so a case-only difference does not false-block (or document the platform boundary)
- Add a locked test: a tracked file pinned as `./<path>` (and a backslash/case variant) is NOT reported untracked and `chalk done` proceeds
- Keep the genuinely-untracked case still blocking (no regression to the #107 vacuous-green guard)

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
