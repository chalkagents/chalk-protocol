---
generator: chalk-protocol
id: "task-61e20fca"
name: "feat: chalk release — write CHANGELOG, bump package.json, tag, mark released"
overview: "chalk release reads the current version (package.json version if present, else 0.0.0), computes the next via bumpVersion (honoring --version/--major/--minor/--patch), and prints the rendered notes"
created: "2026-06-28T18:34:37.255Z"
todos:
  - id: "task-61e20fca-c1"
    content: "chalk release reads the current version (package.json version if present, else 0.0.0), computes the next via bumpVersion (honoring --version/--major/--minor/--patch), and prints the rendered notes"
    status: done
  - id: "task-61e20fca-c2"
    content: "it prepends the notes to CHANGELOG.md (creating it with a title if absent) and, when package.json exists, updates its version field"
    status: done
  - id: "task-61e20fca-c3"
    content: "it marks each included task with released=<version> so a second run finds nothing new (idempotent), and reports the count"
    status: done
  - id: "task-61e20fca-c4"
    content: "it creates an annotated git tag v<version> unless --no-tag, and tolerates a non-git directory without crashing"
    status: done
  - id: "task-61e20fca-c5"
    content: "with no releasable tasks it exits cleanly without bumping or tagging"
    status: done
---

# feat: chalk release — write CHANGELOG, bump package.json, tag, mark released

> state: **done** · phase: discovery

## Objective

- chalk release reads the current version (package.json version if present, else 0.0.0), computes the next via bumpVersion (honoring --version/--major/--minor/--patch), and prints the rendered notes
- it prepends the notes to CHANGELOG.md (creating it with a title if absent) and, when package.json exists, updates its version field
- it marks each included task with released=<version> so a second run finds nothing new (idempotent), and reports the count
- it creates an annotated git tag v<version> unless --no-tag, and tolerates a non-git directory without crashing
- with no releasable tasks it exits cleanly without bumping or tagging

## Locked tests (read-only — P6)

- `test/release-cli.test.mjs`

## Reviews

- **pass** · 2026-06-28T18:44 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
