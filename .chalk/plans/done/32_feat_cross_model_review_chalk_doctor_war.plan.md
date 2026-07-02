---
generator: chalk-protocol
id: "task-706eb3c4"
name: "feat: cross-model review — chalk doctor warns when the reviewer shares the executor model"
overview: "chalk doctor warns when the adversarial reviewer shares the executor's model (same base binary + same/absent --model)"
created: "2026-06-30T14:05:37.582Z"
todos:
  - id: "task-706eb3c4-c1"
    content: "chalk doctor warns when the adversarial reviewer shares the executor's model (same base binary + same/absent --model)"
    status: done
  - id: "task-706eb3c4-c2"
    content: "sameModelFamily and modelSignature detect the same-model case and clear on a different model or tool"
    status: done
---

# feat: cross-model review — chalk doctor warns when the reviewer shares the executor model

> state: **done** · phase: discovery

## Objective

- chalk doctor warns when the adversarial reviewer shares the executor's model (same base binary + same/absent --model)
- sameModelFamily and modelSignature detect the same-model case and clear on a different model or tool

## Locked tests (read-only — P6)

- `test/crossmodel.test.mjs`

## Reviews

- **pass** · 2026-06-30T14:08 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
