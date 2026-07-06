---
generator: chalk-protocol
id: "task-021f4985"
name: "fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)"
overview: "chalk release --commit writes CHANGELOG.md + the package.json bump, creates a git commit containing exactly those release artifacts (conventional message chore(release): vX.Y.Z), then tags vX.Y.Z on that commit — git show vX.Y.Z:package.json reports the bumped version"
created: "2026-07-02T06:34:07.475Z"
todos:
  - id: "task-021f4985-c1"
    content: "chalk release --commit writes CHANGELOG.md + the package.json bump, creates a git commit containing exactly those release artifacts (conventional message chore(release): vX.Y.Z), then tags vX.Y.Z on that commit — git show vX.Y.Z:package.json reports the bumped version"
    status: done
  - id: "task-021f4985-c2"
    content: "tag-collision safety is preserved under --commit: when tag vX.Y.Z already exists the command dies BEFORE writing CHANGELOG, bumping package.json, committing, or marking any task released"
    status: done
  - id: "task-021f4985-c3"
    content: "without --commit the existing tag-first behavior is unchanged (all existing release tests stay green)"
    status: done
  - id: "task-021f4985-c4"
    content: "release.yml drops the 'npm pkg set version' tag-normalization step (the tagged tree is published as-is) and its header comment reflects the commit-then-tag flow"
    status: done
  - id: "task-021f4985-c5"
    content: "chalk help documents the --commit flag on the release line"
    status: done
---

# fix: chalk release --commit — commit CHANGELOG+version bump, then tag that commit (removes the release.yml tag-normalization step)

> state: **done** · phase: discovery

## Objective

- chalk release --commit writes CHANGELOG.md + the package.json bump, creates a git commit containing exactly those release artifacts (conventional message chore(release): vX.Y.Z), then tags vX.Y.Z on that commit — git show vX.Y.Z:package.json reports the bumped version
- tag-collision safety is preserved under --commit: when tag vX.Y.Z already exists the command dies BEFORE writing CHANGELOG, bumping package.json, committing, or marking any task released
- without --commit the existing tag-first behavior is unchanged (all existing release tests stay green)
- release.yml drops the 'npm pkg set version' tag-normalization step (the tagged tree is published as-is) and its header comment reflects the commit-then-tag flow
- chalk help documents the --commit flag on the release line

## Locked tests (read-only — P6)

- `test/package.test.mjs`
- `test/release-commit.test.mjs`

## Reviews

- **pass** · 2026-07-06T06:53 · adversary
- **stale** · 2026-07-06T06:54 · amend-spec
- **pass** · 2026-07-06T06:56 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
