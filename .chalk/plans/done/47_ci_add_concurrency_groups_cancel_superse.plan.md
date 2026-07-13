---
generator: chalk-protocol
id: "task-6ee416c2"
name: "ci: add concurrency groups — cancel superseded test runs; serialize releases without cancelling an in-flight publish"
overview: "test.yml declares a top-level concurrency group with cancel-in-progress: true so a newer push supersedes an in-flight test run"
created: "2026-07-13T05:05:56.200Z"
todos:
  - id: "task-6ee416c2-c1"
    content: "test.yml declares a top-level concurrency group with cancel-in-progress: true so a newer push supersedes an in-flight test run"
    status: done
  - id: "task-6ee416c2-c2"
    content: "release.yml declares a top-level concurrency group with cancel-in-progress: false — a publish is never cancelled mid-flight"
    status: done
---

# ci: add concurrency groups — cancel superseded test runs; serialize releases without cancelling an in-flight publish

> state: **done** · phase: discovery

## Objective

- test.yml declares a top-level concurrency group with cancel-in-progress: true so a newer push supersedes an in-flight test run
- release.yml declares a top-level concurrency group with cancel-in-progress: false — a publish is never cancelled mid-flight

## Locked tests (read-only — P6)

- `test/ci-concurrency.test.mjs`

## Reviews

- **pass** · 2026-07-13T05:11 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
