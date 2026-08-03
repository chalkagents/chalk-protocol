---
generator: chalk-protocol
id: "task-4667fb58"
name: "test: validate the provider-neutral release candidate locally"
overview: "npm pack succeeds from the exact dev tree and includes the provider-neutral guides plus all first-party adapter entrypoints"
created: "2026-08-03T11:29:52.378Z"
todos:
  - id: "task-4667fb58-c1"
    content: "npm pack succeeds from the exact dev tree and includes the provider-neutral guides plus all first-party adapter entrypoints"
    status: done
  - id: "task-4667fb58-c2"
    content: "the packed tarball installs into a clean temporary project without fetching runtime dependencies"
    status: done
  - id: "task-4667fb58-c3"
    content: "the installed CLI completes chalk init, chalk connect dry-run, chalk doctor diagnostics, and a manual task start-verify-done lifecycle"
    status: done
  - id: "task-4667fb58-c4"
    content: "Claude, OpenCode, Codex, Gemini, and raw-command adapters pass the installed package offline conformance suite without model or network calls"
    status: done
  - id: "task-4667fb58-c5"
    content: "the repository remains clean apart from Chalk task evidence and the full Chalk verify gate is GREEN"
    status: done
---

# test: validate the provider-neutral release candidate locally

> state: **done** · phase: discovery

## Objective

- npm pack succeeds from the exact dev tree and includes the provider-neutral guides plus all first-party adapter entrypoints
- the packed tarball installs into a clean temporary project without fetching runtime dependencies
- the installed CLI completes chalk init, chalk connect dry-run, chalk doctor diagnostics, and a manual task start-verify-done lifecycle
- Claude, OpenCode, Codex, Gemini, and raw-command adapters pass the installed package offline conformance suite without model or network calls
- the repository remains clean apart from Chalk task evidence and the full Chalk verify gate is GREEN

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
