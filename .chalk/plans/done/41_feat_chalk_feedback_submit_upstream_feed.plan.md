---
generator: chalk-protocol
id: "task-d1c37a28"
name: "feat: chalk feedback --submit — upstream feedback via prefilled GitHub issue URL (#157)"
overview: "buildUpstreamFeedbackUrl is a pure function that percent-encodes the message into a GitHub new-issue URL for the configured upstream repo, including the chalk version in the body and a user-feedback label"
created: "2026-07-09T04:46:13.840Z"
todos:
  - id: "task-d1c37a28-c1"
    content: "buildUpstreamFeedbackUrl is a pure function that percent-encodes the message into a GitHub new-issue URL for the configured upstream repo, including the chalk version in the body and a user-feedback label"
    status: done
  - id: "task-d1c37a28-c2"
    content: "chalk feedback --submit \"<msg>\" prints that URL, works with NO .chalk spine (runs before Store.open), and never creates .chalk/feedback or calls the analysis agent; CHALK_UPSTREAM_REPO overrides the repo"
    status: done
  - id: "task-d1c37a28-c3"
    content: "The existing chalk feedback signal-analysis path is unchanged; an empty --submit message is a clear usage error"
    status: done
---

# feat: chalk feedback --submit — upstream feedback via prefilled GitHub issue URL (#157)

> state: **done** · phase: discovery

## Objective

- buildUpstreamFeedbackUrl is a pure function that percent-encodes the message into a GitHub new-issue URL for the configured upstream repo, including the chalk version in the body and a user-feedback label
- chalk feedback --submit "<msg>" prints that URL, works with NO .chalk spine (runs before Store.open), and never creates .chalk/feedback or calls the analysis agent; CHALK_UPSTREAM_REPO overrides the repo
- The existing chalk feedback signal-analysis path is unchanged; an empty --submit message is a clear usage error

## Locked tests (read-only — P6)

- `test/feedback-submit.test.mjs`

## Reviews

- **pass** · 2026-07-09T04:47 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
