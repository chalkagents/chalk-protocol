---
generator: chalk-protocol
id: "task-3c66f66a"
name: "feat: harden P7 blindness — doctor fails on git-tracked held-out + pin audit output withholding"
overview: "chalk doctor fails (exit 2) when held-out files are git-tracked — a worktree checkout would leak them into the agent's sandbox (defeats P7)"
created: "2026-06-30T14:13:30.776Z"
todos:
  - id: "task-3c66f66a-c1"
    content: "chalk doctor fails (exit 2) when held-out files are git-tracked — a worktree checkout would leak them into the agent's sandbox (defeats P7)"
    status: done
  - id: "task-3c66f66a-c2"
    content: "chalk audit withholds the held-out command's stdout/stderr so hidden assertions can't reach the agent"
    status: done
---

# feat: harden P7 blindness — doctor fails on git-tracked held-out + pin audit output withholding

> state: **done** · phase: discovery

## Objective

- chalk doctor fails (exit 2) when held-out files are git-tracked — a worktree checkout would leak them into the agent's sandbox (defeats P7)
- chalk audit withholds the held-out command's stdout/stderr so hidden assertions can't reach the agent

## Locked tests (read-only — P6)

- `test/heldout-blindness.test.mjs`

## Reviews

- **pass** · 2026-06-30T14:16 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
