---
generator: chalk-protocol
id: "task-d8399a80"
name: "feat: feedback signals — collect external signals and run the analysis agent"
overview: "lib/feedback.mjs exports collectSignals(store, opts) and runFeedback(store, signals)"
created: "2026-06-28T20:09:50.747Z"
todos:
  - id: "task-d8399a80-c1"
    content: "lib/feedback.mjs exports collectSignals(store, opts) and runFeedback(store, signals)"
    status: done
  - id: "task-d8399a80-c2"
    content: "collectSignals gathers signal files from .chalk/feedback/ (.md/.txt/.json, excluding the archive/ subdir) plus any opts.input text, and returns { digest, files } where files are the source paths"
    status: done
  - id: "task-d8399a80-c3"
    content: "runFeedback runs protocol.feedback.command with the signals digest on stdin and tolerantly parses { issues:[{title, body, severity, labels}] }, returning { status, issues } (mirrors runRetro)"
    status: done
  - id: "task-d8399a80-c4"
    content: "collectSignals returns an empty digest and no files when there are no signals"
    status: done
---

# feat: feedback signals — collect external signals and run the analysis agent

> state: **done** · phase: discovery

## Objective

- lib/feedback.mjs exports collectSignals(store, opts) and runFeedback(store, signals)
- collectSignals gathers signal files from .chalk/feedback/ (.md/.txt/.json, excluding the archive/ subdir) plus any opts.input text, and returns { digest, files } where files are the source paths
- runFeedback runs protocol.feedback.command with the signals digest on stdin and tolerantly parses { issues:[{title, body, severity, labels}] }, returning { status, issues } (mirrors runRetro)
- collectSignals returns an empty digest and no files when there are no signals

## Locked tests (read-only — P6)

- `test/feedback.test.mjs`

## Reviews

- **pass** · 2026-06-28T20:12 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
