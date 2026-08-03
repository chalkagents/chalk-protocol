---
generator: chalk-protocol
id: "task-2b356654"
name: "release: prepare v0.4.0 locally"
overview: "package metadata consistently reports version 0.4.0"
created: "2026-08-03T12:28:00.212Z"
todos:
  - id: "task-2b356654-c1"
    content: "package metadata consistently reports version 0.4.0"
    status: done
  - id: "task-2b356654-c2"
    content: "the changelog promotes the provider-agnostic runtime notes from Unreleased to v0.4.0 dated 2026-08-03 and preserves compatibility and deprecation guidance"
    status: done
  - id: "task-2b356654-c3"
    content: "npm pack produces chalk-protocol-0.4.0.tgz containing the provider-neutral guides and all first-party adapter entrypoints"
    status: done
  - id: "task-2b356654-c4"
    content: "the v0.4.0 tarball installs offline in a clean temporary project and the installed CLI reports 0.4.0, initializes a project, and passes offline adapter conformance"
    status: done
  - id: "task-2b356654-c5"
    content: "the full Chalk verify gate is GREEN and release preparation creates no tag, push, GitHub Action, or external model call"
    status: done
---

# release: prepare v0.4.0 locally

> state: **done** · phase: discovery

## Objective

- package metadata consistently reports version 0.4.0
- the changelog promotes the provider-agnostic runtime notes from Unreleased to v0.4.0 dated 2026-08-03 and preserves compatibility and deprecation guidance
- npm pack produces chalk-protocol-0.4.0.tgz containing the provider-neutral guides and all first-party adapter entrypoints
- the v0.4.0 tarball installs offline in a clean temporary project and the installed CLI reports 0.4.0, initializes a project, and passes offline adapter conformance
- the full Chalk verify gate is GREEN and release preparation creates no tag, push, GitHub Action, or external model call

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
