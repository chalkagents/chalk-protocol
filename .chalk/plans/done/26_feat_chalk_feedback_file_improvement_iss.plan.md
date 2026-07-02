---
generator: chalk-protocol
id: "task-4e547f53"
name: "feat: chalk feedback — file improvement issues from signals, archive processed"
overview: "chalk feedback collects signals, runs the agent, and files each improvement issue via gh with dedup against open issues (titlesSimilar), a severity floor (default med), --dry-run and --max-issues — mirroring chalk retro"
created: "2026-06-28T20:09:50.802Z"
todos:
  - id: "task-4e547f53-c1"
    content: "chalk feedback collects signals, runs the agent, and files each improvement issue via gh with dedup against open issues (titlesSimilar), a severity floor (default med), --dry-run and --max-issues — mirroring chalk retro"
    status: done
  - id: "task-4e547f53-c2"
    content: "after filing (not in --dry-run) it archives the processed signal files into .chalk/feedback/archive/ so re-runs don't re-analyze them"
    status: done
  - id: "task-4e547f53-c3"
    content: "with no signals it exits cleanly without invoking the agent"
    status: done
  - id: "task-4e547f53-c4"
    content: "protocol.feedback default is { command: '' } in store.mjs init defaults"
    status: done
---

# feat: chalk feedback — file improvement issues from signals, archive processed

> state: **done** · phase: discovery

## Objective

- chalk feedback collects signals, runs the agent, and files each improvement issue via gh with dedup against open issues (titlesSimilar), a severity floor (default med), --dry-run and --max-issues — mirroring chalk retro
- after filing (not in --dry-run) it archives the processed signal files into .chalk/feedback/archive/ so re-runs don't re-analyze them
- with no signals it exits cleanly without invoking the agent
- protocol.feedback default is { command: '' } in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/feedback-cli.test.mjs`

## Reviews

- **pass** · 2026-06-28T20:19 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
