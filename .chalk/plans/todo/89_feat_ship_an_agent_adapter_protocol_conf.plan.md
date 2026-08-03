---
generator: chalk-protocol
id: "task-f0880c0a"
name: "feat: ship an Agent Adapter Protocol conformance kit"
overview: "A single command runs the adapter conformance suite against a configured adapter executable."
created: "2026-08-03T08:32:18.578Z"
todos:
  - id: "task-f0880c0a-c1"
    content: "A single command runs the adapter conformance suite against a configured adapter executable."
    status: pending
  - id: "task-f0880c0a-c2"
    content: "Fixtures cover verbatim multiline input, text output, structured output, noisy output, malformed output, non-zero exit, timeout, missing usage, reported usage, identity, and diagnostics."
    status: pending
  - id: "task-f0880c0a-c3"
    content: "Capability checks cover read-only, workspace-write, and unsupported-capability reporting."
    status: pending
  - id: "task-f0880c0a-c4"
    content: "A mutation fixture proves that a read-only adapter cannot receive a passing conformance result after changing the workspace."
    status: pending
  - id: "task-f0880c0a-c5"
    content: "Claude, OpenCode, raw-command, and fake adapters run through the same harness."
    status: pending
  - id: "task-f0880c0a-c6"
    content: "Results support human-readable and JSON output."
    status: pending
  - id: "task-f0880c0a-c7"
    content: "The harness makes no network call unless an explicit `--live` mode is selected."
    status: pending
  - id: "task-f0880c0a-c8"
    content: "The protocol version tested is printed in every result."
    status: pending
  - id: "task-f0880c0a-c9"
    content: "External adapter author documentation uses only public package artifacts."
    status: pending
---

# feat: ship an Agent Adapter Protocol conformance kit

> state: **specd** · phase: discovery

## Objective

- A single command runs the adapter conformance suite against a configured adapter executable.
- Fixtures cover verbatim multiline input, text output, structured output, noisy output, malformed output, non-zero exit, timeout, missing usage, reported usage, identity, and diagnostics.
- Capability checks cover read-only, workspace-write, and unsupported-capability reporting.
- A mutation fixture proves that a read-only adapter cannot receive a passing conformance result after changing the workspace.
- Claude, OpenCode, raw-command, and fake adapters run through the same harness.
- Results support human-readable and JSON output.
- The harness makes no network call unless an explicit `--live` mode is selected.
- The protocol version tested is printed in every result.
- External adapter author documentation uses only public package artifacts.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
