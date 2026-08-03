---
generator: chalk-protocol
id: "task-4ee30eb2"
name: "design: specify Agent Adapter Protocol v1 and canonical role contracts"
overview: "A normative protocol document uses MUST/SHOULD/MAY language and carries an explicit version."
created: "2026-08-03T05:53:06.115Z"
todos:
  - id: "task-4ee30eb2-c1"
    content: "A normative protocol document uses MUST/SHOULD/MAY language and carries an explicit version."
    status: pending
  - id: "task-4ee30eb2-c2"
    content: "Request and response examples cover text output, structured JSON output, failure, and usage reporting."
    status: pending
  - id: "task-4ee30eb2-c3"
    content: "Every existing agent-backed Chalk stage maps to a named role and output contract."
    status: pending
  - id: "task-4ee30eb2-c4"
    content: "Access requests distinguish at least `read-only` and `workspace-write`."
    status: pending
  - id: "task-4ee30eb2-c5"
    content: "Identity includes an opaque reviewer-independence key; Chalk does not infer it from provider names."
    status: pending
  - id: "task-4ee30eb2-c6"
    content: "Compatibility behavior for current command strings is specified."
    status: pending
  - id: "task-4ee30eb2-c7"
    content: "A fake-adapter fixture demonstrates that the contract is implementable without importing Chalk internals."
    status: pending
  - id: "task-4ee30eb2-c8"
    content: "The design explicitly identifies what remains inside Chalk core versus inside an adapter."
    status: pending
---

# design: specify Agent Adapter Protocol v1 and canonical role contracts

> state: **specd** · phase: discovery

## Objective

- A normative protocol document uses MUST/SHOULD/MAY language and carries an explicit version.
- Request and response examples cover text output, structured JSON output, failure, and usage reporting.
- Every existing agent-backed Chalk stage maps to a named role and output contract.
- Access requests distinguish at least `read-only` and `workspace-write`.
- Identity includes an opaque reviewer-independence key; Chalk does not infer it from provider names.
- Compatibility behavior for current command strings is specified.
- A fake-adapter fixture demonstrates that the contract is implementable without importing Chalk internals.
- The design explicitly identifies what remains inside Chalk core versus inside an adapter.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
