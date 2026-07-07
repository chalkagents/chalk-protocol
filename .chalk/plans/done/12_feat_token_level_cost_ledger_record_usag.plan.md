---
generator: chalk-protocol
id: "task-a8aa7559"
name: "feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable"
overview: "Agent calls through a claude-shaped command record `tokens`, `costUsd`, and `turns` in `.chalk/local/cost.jsonl`; non-claude runners still record ms-only, and a malformed/missing envelope never fails the stage."
created: "2026-07-06T09:17:15.843Z"
todos:
  - id: "task-a8aa7559-c1"
    content: "Agent calls through a claude-shaped command record `tokens`, `costUsd`, and `turns` in `.chalk/local/cost.jsonl`; non-claude runners still record ms-only, and a malformed/missing envelope never fails the stage."
    status: done
  - id: "task-a8aa7559-c2"
    content: "The executor invocation in `chalk run` captures usage without losing live terminal output."
    status: done
  - id: "task-a8aa7559-c3"
    content: "Injecting `--output-format json` does not break the reviewer/retro/discovery/feedback JSON parsing (envelope is unwrapped before the existing parsers see it), and commands that already pin `--output-format` are left untouched."
    status: done
  - id: "task-a8aa7559-c4"
    content: "`chalk cost` shows per-stage/per-task tokens, overhead share, and tokens-per-accepted-task, and still renders correctly against a ledger containing only legacy ms-only records."
    status: done
---

# feat: token-level cost ledger — record usage per agent call so chalk's induced overhead (and savings) are measurable

> state: **done** · phase: discovery

## Objective

- Agent calls through a claude-shaped command record `tokens`, `costUsd`, and `turns` in `.chalk/local/cost.jsonl`; non-claude runners still record ms-only, and a malformed/missing envelope never fails the stage.
- The executor invocation in `chalk run` captures usage without losing live terminal output.
- Injecting `--output-format json` does not break the reviewer/retro/discovery/feedback JSON parsing (envelope is unwrapped before the existing parsers see it), and commands that already pin `--output-format` are left untouched.
- `chalk cost` shows per-stage/per-task tokens, overhead share, and tokens-per-accepted-task, and still renders correctly against a ledger containing only legacy ms-only records.

## Locked tests (read-only — P6)

- `test/cost-ledger.test.mjs`

## Reviews

- **block** · 2026-07-06T09:37 · adversary
- **block** · 2026-07-06T09:41 · adversary
- **pass** · 2026-07-06T09:49 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
