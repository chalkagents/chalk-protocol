---
generator: chalk-protocol
id: "task-2cd1340d"
name: "fix: normalize Windows filesystem identity probes"
overview: "Synchronous and asynchronous verification identity checks derive inode, device, and timestamp metadata through one exact stat representation so unchanged Windows inputs and storage remain fresh."
created: "2026-09-15T13:32:29.592Z"
todos:
  - id: "task-2cd1340d-c1"
    content: "Synchronous and asynchronous verification identity checks derive inode, device, and timestamp metadata through one exact stat representation so unchanged Windows inputs and storage remain fresh."
    status: done
  - id: "task-2cd1340d-c2"
    content: "Archive replacement, source mutation, policy mutation, and storage redirection still fail closed while content hashing remains bounded and asynchronous."
    status: done
  - id: "task-2cd1340d-c3"
    content: "The existing minimum-Node, Linux, and Windows verification matrix passes without weakening platform assertions."
    status: done
---

# fix: normalize Windows filesystem identity probes

> state: **done** · phase: discovery

## Objective

- Synchronous and asynchronous verification identity checks derive inode, device, and timestamp metadata through one exact stat representation so unchanged Windows inputs and storage remain fresh.
- Archive replacement, source mutation, policy mutation, and storage redirection still fail closed while content hashing remains bounded and asynchronous.
- The existing minimum-Node, Linux, and Windows verification matrix passes without weakening platform assertions.

## Locked tests (read-only — P6)

- `test/verification-storage-identity.test.mjs`
- `test/verification-record.test.mjs`
- `test/verification-retention.test.mjs`
- `test/verification-source-metadata.test.mjs`
- `test/verification-automated-callers.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
