---
generator: chalk-protocol
id: "task-81a90f03"
name: "fix: decouple the issue-pull count from the loop parser — one shared literal so a CLI reword can't silently zero the standing loop's steady-state detection"
overview: "The 'pulled N new issue(s)' phrasing and its parser live in one shared module (lib/pull-count.mjs); bin/chalk.mjs emits via pulledIssuesLine and lib/loop.mjs reads via parsePulledIssues — no divergent inline literal"
created: "2026-07-13T02:45:35.461Z"
todos:
  - id: "task-81a90f03-c1"
    content: "The 'pulled N new issue(s)' phrasing and its parser live in one shared module (lib/pull-count.mjs); bin/chalk.mjs emits via pulledIssuesLine and lib/loop.mjs reads via parsePulledIssues — no divergent inline literal"
    status: done
  - id: "task-81a90f03-c2"
    content: "parsePulledIssues round-trips pulledIssuesLine, reads the count through bold-ANSI wrapping + the '(N already tracked)' suffix, and returns 0 when the line is absent"
    status: done
---

# fix: decouple the issue-pull count from the loop parser — one shared literal so a CLI reword can't silently zero the standing loop's steady-state detection

> state: **done** · phase: discovery

## Objective

- The 'pulled N new issue(s)' phrasing and its parser live in one shared module (lib/pull-count.mjs); bin/chalk.mjs emits via pulledIssuesLine and lib/loop.mjs reads via parsePulledIssues — no divergent inline literal
- parsePulledIssues round-trips pulledIssuesLine, reads the count through bold-ANSI wrapping + the '(N already tracked)' suffix, and returns 0 when the line is absent

## Locked tests (read-only — P6)

- `test/pull-count.test.mjs`

## Reviews

- **pass** · 2026-07-13T02:47 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
