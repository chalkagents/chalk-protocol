---
generator: chalk-protocol
id: "task-9a0bfb60"
name: "fix: testing-found bugs — release --dry-run + portal absolute --out"
overview: "chalk release supports --dry-run: it prints the would-be version and notes and reports counts, but writes NO CHANGELOG, does NOT bump package.json, creates NO git tag, and marks NO tasks released"
created: "2026-06-29T08:21:10.927Z"
todos:
  - id: "task-9a0bfb60-c1"
    content: "chalk release supports --dry-run: it prints the would-be version and notes and reports counts, but writes NO CHANGELOG, does NOT bump package.json, creates NO git tag, and marks NO tasks released"
    status: done
  - id: "task-9a0bfb60-c2"
    content: "chalk portal resolves --out correctly (resolve, not join): an absolute --out writes to that absolute path (not inside the repo), and a relative --out stays relative to the repo root"
    status: done
---

# fix: testing-found bugs — release --dry-run + portal absolute --out

> state: **done** · phase: discovery

## Objective

- chalk release supports --dry-run: it prints the would-be version and notes and reports counts, but writes NO CHANGELOG, does NOT bump package.json, creates NO git tag, and marks NO tasks released
- chalk portal resolves --out correctly (resolve, not join): an absolute --out writes to that absolute path (not inside the repo), and a relative --out stays relative to the repo root

## Locked tests (read-only — P6)

- `test/testfixes.test.mjs`

## Reviews

- **pass** · 2026-06-29T08:25 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
